let home: Promise<string> | undefined

/** "~/Movies" → "/Users/me/Movies" (mpv and the file system don't expand ~ themselves). */
export async function expandHome(path: string): Promise<string> {
  if (!/^~(\/|$)/.test(path)) return path
  home ??= window.flp.app.homeDir()
  return (await home) + path.slice(1)
}
