import type { Attachment } from '../types'

export async function downscaleImage(dataUrl: string, max = 1280, quality = 0.84): Promise<string> {
  const image = new Image()
  image.src = dataUrl
  try {
    await image.decode()
  } catch {
    return dataUrl
  }
  const scale = Math.min(1, max / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export function screenCaptureSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)
}

export async function captureScreen(): Promise<Attachment> {
  if (!screenCaptureSupported()) throw new Error('Screen capture is not supported on this device')
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  try {
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    await video.play()
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    const max = 1400
    const scale = Math.min(1, max / Math.max(video.videoWidth || 1280, video.videoHeight || 720))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((video.videoWidth || 1280) * scale))
    canvas.height = Math.max(1, Math.round((video.videoHeight || 720) * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not capture the screen')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = await downscaleImage(canvas.toDataURL('image/jpeg', 0.88))
    return { kind: 'image', dataUrl, label: 'Screen' }
  } finally {
    stream.getTracks().forEach((track) => track.stop())
  }
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
  return { kind: 'image', dataUrl: await downscaleImage(dataUrl), label: file.name }
}
