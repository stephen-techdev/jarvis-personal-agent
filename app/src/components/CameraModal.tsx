import { useEffect, useRef, useState } from 'react'
import type { Attachment } from '../types'
import { downscaleImage } from '../lib/vision'

interface Props {
  onClose: () => void
  onCapture: (attachment: Attachment) => void
}

export function CameraModal({ onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function start() {
      setError('')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Camera unavailable')
      }
    }
    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [facing])

  async function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const max = 1280
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = await downscaleImage(canvas.toDataURL('image/jpeg', 0.9))
    onCapture({ kind: 'image', dataUrl, label: 'Camera' })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="camera-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Camera">
        <div className="camera-frame">
          {error ? (
            <div className="camera-error">
              <p>{error}</p>
              <p className="hint">Check browser camera permissions, then reopen.</p>
            </div>
          ) : (
            <video ref={videoRef} playsInline muted />
          )}
        </div>
        <div className="camera-actions">
          <button className="btn ghost" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
            Flip
          </button>
          <button className="btn primary" onClick={() => void capture()} disabled={Boolean(error)}>
            Capture
          </button>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
