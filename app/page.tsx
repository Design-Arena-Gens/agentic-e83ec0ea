'use client'

import { useState } from 'react'

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [numberOfVideos, setNumberOfVideos] = useState(1)
  const [durationSeconds, setDurationSeconds] = useState(8)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [videos, setVideos] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatus('Initiating video generation...')
    setError('')
    setVideos([])

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          numberOfVideos,
          durationSeconds,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate video')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))

            if (data.status) {
              setStatus(data.status)
            }

            if (data.error) {
              setError(data.error)
              setLoading(false)
              return
            }

            if (data.videos) {
              setVideos(data.videos)
              setStatus('Video generation complete!')
              setLoading(false)
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>🎬 Veo Video Generator</h1>
      <p className="subtitle">Generate AI videos using Google Veo 2.0</p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="prompt">Video Description</label>
          <textarea
            id="prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the video you want to generate..."
            required
            disabled={loading}
          />
        </div>

        <div className="options">
          <div className="option">
            <label htmlFor="aspectRatio">Aspect Ratio</label>
            <select
              id="aspectRatio"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              disabled={loading}
            >
              <option value="16:9">16:9</option>
              <option value="16:10">16:10</option>
            </select>
          </div>

          <div className="option">
            <label htmlFor="numberOfVideos">Number of Videos</label>
            <input
              type="number"
              id="numberOfVideos"
              min="1"
              max="4"
              value={numberOfVideos}
              onChange={(e) => setNumberOfVideos(parseInt(e.target.value))}
              disabled={loading}
            />
          </div>

          <div className="option">
            <label htmlFor="durationSeconds">Duration (seconds)</label>
            <input
              type="number"
              id="durationSeconds"
              min="5"
              max="8"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(parseInt(e.target.value))}
              disabled={loading}
            />
          </div>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? (
            <>
              Generating...
              <span className="spinner"></span>
            </>
          ) : (
            'Generate Video'
          )}
        </button>
      </form>

      {status && !error && (
        <div className={`status ${loading ? 'loading' : 'success'}`}>
          {status}
        </div>
      )}

      {error && (
        <div className="status error">
          {error}
        </div>
      )}

      {videos.length > 0 && (
        <div className="videos">
          {videos.map((video, index) => (
            <div key={index} className="video-item">
              <video controls>
                <source src={video} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              <a href={video} download={`video_${index}.mp4`}>
                Download Video {index + 1}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
