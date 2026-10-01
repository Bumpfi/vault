import Hls from 'hls.js'
import { useEffect, useRef } from 'react'

/** Plays a raw HLS playlist — used for recovered VODs the embed can't play. */
export function HlsPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // Safari plays HLS natively; everything else needs hls.js.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return
    }
    if (!Hls.isSupported()) return
    const hls = new Hls()
    hls.loadSource(src)
    hls.attachMedia(video)
    return () => hls.destroy()
  }, [src])

  return <video ref={videoRef} controls autoPlay className="size-full" />
}
