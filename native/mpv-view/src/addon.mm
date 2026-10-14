// libmpv hosted in an NSView placed underneath Electron's web contents.
// The web UI is transparent over the video area, so the video shows through.

#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <OpenGL/gl3.h>
#include <dlfcn.h>
#include <deque>
#include <string>
#include <vector>
#include <napi.h>
#include <mpv/client.h>
#include <mpv/render_gl.h>

static void *glProcAddress(void *, const char *name) {
  static void *lib = dlopen("/System/Library/Frameworks/OpenGL.framework/OpenGL", RTLD_LAZY | RTLD_LOCAL);
  return lib ? dlsym(lib, name) : nullptr;
}

// ---------- video layer ----------

@interface FLPVideoLayer : CAOpenGLLayer
@property(nonatomic) mpv_handle *mpv;
@property(nonatomic) mpv_render_context *renderCtx;
@property(nonatomic) CGLContextObj cglCtx;
- (void)teardown;
@end

static void onRenderUpdate(void *ctx) {
  // Called from an mpv thread; schedule a redraw on the main thread.
  FLPVideoLayer *layer = (__bridge FLPVideoLayer *)ctx;
  dispatch_async(dispatch_get_main_queue(), ^{
    [layer setNeedsDisplay];
  });
}

@implementation FLPVideoLayer

- (instancetype)init {
  if ((self = [super init])) {
    self.asynchronous = NO;
    self.needsDisplayOnBoundsChange = YES;
    self.opaque = YES;
    self.backgroundColor = NSColor.blackColor.CGColor;
  }
  return self;
}

- (CGLPixelFormatObj)copyCGLPixelFormatForDisplayMask:(uint32_t)mask {
  CGLPixelFormatAttribute attrs[] = {
      kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core,
      kCGLPFAAccelerated, kCGLPFADoubleBuffer, kCGLPFAAllowOfflineRenderers,
      (CGLPixelFormatAttribute)0};
  CGLPixelFormatObj pix = nullptr;
  GLint count = 0;
  CGLChoosePixelFormat(attrs, &pix, &count);
  return pix;
}

- (CGLContextObj)copyCGLContextForPixelFormat:(CGLPixelFormatObj)pf {
  CGLContextObj ctx = [super copyCGLContextForPixelFormat:pf];
  if (!self.renderCtx && self.mpv) {
    CGLSetCurrentContext(ctx);
    mpv_opengl_init_params gl{glProcAddress, nullptr};
    int advanced = 1;
    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_API_TYPE, (void *)MPV_RENDER_API_TYPE_OPENGL},
        {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &gl},
        {MPV_RENDER_PARAM_ADVANCED_CONTROL, &advanced},
        {MPV_RENDER_PARAM_INVALID, nullptr}};
    mpv_render_context *rc = nullptr;
    if (mpv_render_context_create(&rc, self.mpv, params) >= 0) {
      self.renderCtx = rc;
      self.cglCtx = ctx;
      mpv_render_context_set_update_callback(rc, onRenderUpdate, (__bridge void *)self);
    }
  }
  return ctx;
}

- (BOOL)canDrawInCGLContext:(CGLContextObj)ctx pixelFormat:(CGLPixelFormatObj)pf
               forLayerTime:(CFTimeInterval)t displayTime:(const CVTimeStamp *)ts {
  return YES;
}

- (void)drawInCGLContext:(CGLContextObj)ctx pixelFormat:(CGLPixelFormatObj)pf
            forLayerTime:(CFTimeInterval)t displayTime:(const CVTimeStamp *)ts {
  CGLSetCurrentContext(ctx);
  GLint vp[4] = {0, 0, 0, 0};
  glGetIntegerv(GL_VIEWPORT, vp);
  if (self.renderCtx) {
    mpv_render_context_update(self.renderCtx);
    GLint fbo = 0;
    glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &fbo);
    mpv_opengl_fbo target{(int)fbo, vp[2], vp[3], 0};
    int flip = 1;
    mpv_render_param params[] = {{MPV_RENDER_PARAM_OPENGL_FBO, &target},
                                 {MPV_RENDER_PARAM_FLIP_Y, &flip},
                                 {MPV_RENDER_PARAM_INVALID, nullptr}};
    mpv_render_context_render(self.renderCtx, params);
  } else {
    glClearColor(0, 0, 0, 1);
    glClear(GL_COLOR_BUFFER_BIT);
  }
  [super drawInCGLContext:ctx pixelFormat:pf forLayerTime:t displayTime:ts];
  if (self.renderCtx) mpv_render_context_report_swap(self.renderCtx);
}

- (void)teardown {
  if (self.renderCtx) {
    mpv_render_context_set_update_callback(self.renderCtx, nullptr, nullptr);
    if (self.cglCtx) CGLSetCurrentContext(self.cglCtx);
    mpv_render_context_free(self.renderCtx);
    self.renderCtx = nullptr;
  }
}

@end

@interface FLPVideoView : NSView
@property(nonatomic, strong) FLPVideoLayer *videoLayer;
@end

@implementation FLPVideoView
- (CALayer *)makeBackingLayer {
  return self.videoLayer;
}
- (void)viewDidChangeBackingProperties {
  [super viewDidChangeBackingProperties];
  self.layer.contentsScale = self.window ? self.window.backingScaleFactor : 2.0;
}
- (NSView *)hitTest:(NSPoint)p {
  return nil;  // mouse events go to the web UI above
}
@end

// ---------- JS <-> mpv_node ----------

static Napi::Value nodeToJs(Napi::Env env, const mpv_node *n) {
  switch (n->format) {
    case MPV_FORMAT_STRING:
    case MPV_FORMAT_OSD_STRING:
      return Napi::String::New(env, n->u.string ? n->u.string : "");
    case MPV_FORMAT_FLAG:
      return Napi::Boolean::New(env, n->u.flag != 0);
    case MPV_FORMAT_INT64:
      return Napi::Number::New(env, (double)n->u.int64);
    case MPV_FORMAT_DOUBLE:
      return Napi::Number::New(env, n->u.double_);
    case MPV_FORMAT_NODE_ARRAY: {
      auto arr = Napi::Array::New(env, n->u.list->num);
      for (int i = 0; i < n->u.list->num; i++) arr.Set(i, nodeToJs(env, &n->u.list->values[i]));
      return arr;
    }
    case MPV_FORMAT_NODE_MAP: {
      auto obj = Napi::Object::New(env);
      for (int i = 0; i < n->u.list->num; i++)
        obj.Set(n->u.list->keys[i], nodeToJs(env, &n->u.list->values[i]));
      return obj;
    }
    default:
      return env.Null();
  }
}

// Owns all memory referenced by an mpv_node built from a JS value.
struct NodeBuilder {
  std::deque<std::string> strings;
  std::deque<mpv_node_list> lists;
  std::deque<std::vector<mpv_node>> values;
  std::deque<std::vector<char *>> keys;

  void build(const Napi::Value &v, mpv_node *out) {
    if (v.IsBoolean()) {
      out->format = MPV_FORMAT_FLAG;
      out->u.flag = v.As<Napi::Boolean>().Value() ? 1 : 0;
    } else if (v.IsNumber()) {
      double d = v.As<Napi::Number>().DoubleValue();
      if (d == (double)(int64_t)d && d > -9e15 && d < 9e15) {
        out->format = MPV_FORMAT_INT64;
        out->u.int64 = (int64_t)d;
      } else {
        out->format = MPV_FORMAT_DOUBLE;
        out->u.double_ = d;
      }
    } else if (v.IsString()) {
      strings.push_back(v.As<Napi::String>().Utf8Value());
      out->format = MPV_FORMAT_STRING;
      out->u.string = strings.back().data();
    } else if (v.IsArray()) {
      auto arr = v.As<Napi::Array>();
      values.emplace_back(arr.Length());
      auto &vals = values.back();
      for (uint32_t i = 0; i < arr.Length(); i++) build(arr.Get(i), &vals[i]);
      lists.push_back({(int)vals.size(), vals.data(), nullptr});
      out->format = MPV_FORMAT_NODE_ARRAY;
      out->u.list = &lists.back();
    } else if (v.IsObject()) {
      auto obj = v.As<Napi::Object>();
      auto names = obj.GetPropertyNames();
      values.emplace_back(names.Length());
      keys.emplace_back(names.Length());
      auto &vals = values.back();
      auto &ks = keys.back();
      for (uint32_t i = 0; i < names.Length(); i++) {
        strings.push_back(names.Get(i).ToString().Utf8Value());
        ks[i] = strings.back().data();
        build(obj.Get(names.Get(i)), &vals[i]);
      }
      lists.push_back({(int)vals.size(), vals.data(), ks.data()});
      out->format = MPV_FORMAT_NODE_MAP;
      out->u.list = &lists.back();
    } else {
      out->format = MPV_FORMAT_NONE;
    }
  }
};

// ---------- Player ----------

class Player : public Napi::ObjectWrap<Player> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    auto cls = DefineClass(env, "Player",
                           {InstanceMethod("command", &Player::Command),
                            InstanceMethod("setProperty", &Player::SetProperty),
                            InstanceMethod("getProperty", &Player::GetProperty),
                            InstanceMethod("observe", &Player::Observe),
                            InstanceMethod("poll", &Player::Poll),
                            InstanceMethod("setBounds", &Player::SetBounds),
                            InstanceMethod("setVisible", &Player::SetVisible),
                            InstanceMethod("destroy", &Player::Destroy)});
    exports.Set("Player", cls);
    return exports;
  }

  // new Player(nativeWindowHandle: Buffer, onWakeup: () => void, options: Record<string, string>)
  Player(const Napi::CallbackInfo &info) : Napi::ObjectWrap<Player>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsFunction()) {
      Napi::TypeError::New(env, "Player(handle: Buffer, onWakeup: Function, options?)").ThrowAsJavaScriptException();
      return;
    }
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    NSView *contentView = (__bridge NSView *)(*reinterpret_cast<void **>(buf.Data()));

    mpv_ = mpv_create();
    if (!mpv_) {
      Napi::Error::New(env, "mpv_create failed").ThrowAsJavaScriptException();
      return;
    }
    mpv_set_option_string(mpv_, "vo", "libmpv");
    mpv_set_option_string(mpv_, "hwdec", "auto-safe");
    mpv_set_option_string(mpv_, "keep-open", "yes");
    mpv_set_option_string(mpv_, "idle", "yes");
    mpv_set_option_string(mpv_, "input-default-bindings", "no");
    mpv_set_option_string(mpv_, "input-vo-keyboard", "no");
    mpv_set_option_string(mpv_, "osc", "no");
    mpv_set_option_string(mpv_, "terminal", "no");
    if (info.Length() > 2 && info[2].IsObject()) {
      auto opts = info[2].As<Napi::Object>();
      auto names = opts.GetPropertyNames();
      for (uint32_t i = 0; i < names.Length(); i++) {
        std::string k = names.Get(i).ToString().Utf8Value();
        std::string v = opts.Get(k).ToString().Utf8Value();
        mpv_set_option_string(mpv_, k.c_str(), v.c_str());
      }
    }
    if (mpv_initialize(mpv_) < 0) {
      Napi::Error::New(env, "mpv_initialize failed").ThrowAsJavaScriptException();
      return;
    }
    mpv_request_log_messages(mpv_, "warn");

    wakeup_ = Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(), "mpv-wakeup", 0, 1);
    wakeup_.Unref(env);
    mpv_set_wakeup_callback(mpv_, &Player::OnWakeup, this);

    layer_ = [FLPVideoLayer layer];
    layer_.mpv = mpv_;
    view_ = [[FLPVideoView alloc] initWithFrame:contentView.bounds];
    view_.videoLayer = layer_;
    view_.wantsLayer = YES;
    view_.autoresizingMask = NSViewNotSizable;
    [contentView addSubview:view_ positioned:NSWindowBelow relativeTo:nil];
    layer_.contentsScale = contentView.window ? contentView.window.backingScaleFactor : 2.0;
    [layer_ setNeedsDisplay];
  }

  ~Player() { Teardown(); }

 private:
  mpv_handle *mpv_ = nullptr;
  FLPVideoLayer *layer_ = nil;
  FLPVideoView *view_ = nil;
  Napi::ThreadSafeFunction wakeup_;
  bool pending_ = false;

  static void OnWakeup(void *ctx) {
    auto *self = static_cast<Player *>(ctx);
    // Coalesce: one JS callback drains every queued event.
    if (self->pending_) return;
    self->pending_ = true;
    self->wakeup_.NonBlockingCall();
  }

  void Teardown() {
    if (!mpv_) return;
    mpv_set_wakeup_callback(mpv_, nullptr, nullptr);
    [layer_ teardown];
    [view_ removeFromSuperview];
    view_ = nil;
    layer_ = nil;
    mpv_terminate_destroy(mpv_);
    mpv_ = nullptr;
    wakeup_.Release();
  }

  bool Alive(const Napi::CallbackInfo &info) {
    if (mpv_) return true;
    Napi::Error::New(info.Env(), "player destroyed").ThrowAsJavaScriptException();
    return false;
  }

  // command(args: any[]) -> result
  Napi::Value Command(const Napi::CallbackInfo &info) {
    if (!Alive(info)) return info.Env().Undefined();
    NodeBuilder b;
    mpv_node args, result;
    b.build(info[0], &args);
    int err = mpv_command_node(mpv_, &args, &result);
    if (err < 0) {
      Napi::Error::New(info.Env(), mpv_error_string(err)).ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }
    auto out = nodeToJs(info.Env(), &result);
    mpv_free_node_contents(&result);
    return out;
  }

  Napi::Value SetProperty(const Napi::CallbackInfo &info) {
    if (!Alive(info)) return info.Env().Undefined();
    std::string name = info[0].ToString().Utf8Value();
    NodeBuilder b;
    mpv_node value;
    b.build(info[1], &value);
    int err = mpv_set_property(mpv_, name.c_str(), MPV_FORMAT_NODE, &value);
    if (err < 0)
      Napi::Error::New(info.Env(), name + ": " + mpv_error_string(err)).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }

  Napi::Value GetProperty(const Napi::CallbackInfo &info) {
    if (!Alive(info)) return info.Env().Undefined();
    std::string name = info[0].ToString().Utf8Value();
    mpv_node value;
    if (mpv_get_property(mpv_, name.c_str(), MPV_FORMAT_NODE, &value) < 0) return info.Env().Null();
    auto out = nodeToJs(info.Env(), &value);
    mpv_free_node_contents(&value);
    return out;
  }

  Napi::Value Observe(const Napi::CallbackInfo &info) {
    if (!Alive(info)) return info.Env().Undefined();
    std::string name = info[0].ToString().Utf8Value();
    mpv_observe_property(mpv_, 0, name.c_str(), MPV_FORMAT_NODE);
    return info.Env().Undefined();
  }

  // poll() -> events[]; drains mpv's event queue.
  Napi::Value Poll(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    pending_ = false;
    auto out = Napi::Array::New(env);
    if (!mpv_) return out;
    uint32_t i = 0;
    while (true) {
      mpv_event *ev = mpv_wait_event(mpv_, 0);
      if (ev->event_id == MPV_EVENT_NONE) break;
      auto o = Napi::Object::New(env);
      o.Set("event", mpv_event_name(ev->event_id));
      if (ev->error < 0) o.Set("error", mpv_error_string(ev->error));
      switch (ev->event_id) {
        case MPV_EVENT_PROPERTY_CHANGE: {
          auto *p = (mpv_event_property *)ev->data;
          o.Set("name", p->name);
          o.Set("data", p->format == MPV_FORMAT_NODE ? nodeToJs(env, (mpv_node *)p->data) : env.Null());
          break;
        }
        case MPV_EVENT_END_FILE: {
          auto *e = (mpv_event_end_file *)ev->data;
          const char *reason = "unknown";
          switch (e->reason) {
            case MPV_END_FILE_REASON_EOF: reason = "eof"; break;
            case MPV_END_FILE_REASON_STOP: reason = "stop"; break;
            case MPV_END_FILE_REASON_QUIT: reason = "quit"; break;
            case MPV_END_FILE_REASON_ERROR: reason = "error"; break;
            case MPV_END_FILE_REASON_REDIRECT: reason = "redirect"; break;
          }
          o.Set("reason", reason);
          if (e->reason == MPV_END_FILE_REASON_ERROR) o.Set("error", mpv_error_string(e->error));
          break;
        }
        case MPV_EVENT_LOG_MESSAGE: {
          auto *m = (mpv_event_log_message *)ev->data;
          o.Set("prefix", m->prefix);
          o.Set("level", m->level);
          o.Set("text", m->text);
          break;
        }
        default:
          break;
      }
      out.Set(i++, o);
      if (ev->event_id == MPV_EVENT_SHUTDOWN) break;
    }
    return out;
  }

  // setBounds(x, y, w, h) in window points, origin top-left.
  Napi::Value SetBounds(const Napi::CallbackInfo &info) {
    if (!view_) return info.Env().Undefined();
    double x = info[0].ToNumber(), y = info[1].ToNumber();
    double w = info[2].ToNumber(), h = info[3].ToNumber();
    NSView *parent = view_.superview;
    double top = parent.isFlipped ? y : parent.bounds.size.height - y - h;
    view_.frame = NSMakeRect(x, top, w, h);
    return info.Env().Undefined();
  }

  Napi::Value SetVisible(const Napi::CallbackInfo &info) {
    if (view_) view_.hidden = !info[0].ToBoolean().Value();
    return info.Env().Undefined();
  }

  Napi::Value Destroy(const Napi::CallbackInfo &info) {
    Teardown();
    return info.Env().Undefined();
  }
};

static Napi::Object InitAll(Napi::Env env, Napi::Object exports) { return Player::Init(env, exports); }

NODE_API_MODULE(mpv_view, InitAll)
