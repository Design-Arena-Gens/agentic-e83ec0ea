import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface GenerateRequest {
  prompt: string
  aspectRatio: string
  numberOfVideos: number
  durationSeconds: number
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body: GenerateRequest = await req.json()
        const { prompt, aspectRatio, numberOfVideos, durationSeconds } = body

        if (!prompt) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Prompt is required' })}\n\n`))
          controller.close()
          return
        }

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'GEMINI_API_KEY not configured' })}\n\n`))
          controller.close()
          return
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'Submitting video generation request...' })}\n\n`))

        // Submit video generation request
        const generateResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:generateVideos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            prompt: prompt,
            videoConfig: {
              aspectRatio: aspectRatio,
              numberOfVideos: numberOfVideos,
              durationSeconds: durationSeconds,
              personGeneration: 'ALLOW_ALL',
            },
          }),
        })

        if (!generateResponse.ok) {
          const errorText = await generateResponse.text()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `API Error: ${errorText}` })}\n\n`))
          controller.close()
          return
        }

        const operationData = await generateResponse.json()
        const operationName = operationData.name

        if (!operationName) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'No operation name returned' })}\n\n`))
          controller.close()
          return
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'Video generation in progress. This may take several minutes...' })}\n\n`))

        // Poll for completion
        let done = false
        let attempts = 0
        const maxAttempts = 120 // 20 minutes max

        while (!done && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
          attempts++

          const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}`, {
            headers: {
              'x-goog-api-key': apiKey,
            },
          })

          if (!statusResponse.ok) {
            const errorText = await statusResponse.text()
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Status check failed: ${errorText}` })}\n\n`))
            controller.close()
            return
          }

          const statusData = await statusResponse.json()
          done = statusData.done

          if (!done) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: `Still generating... (${attempts * 10}s elapsed)` })}\n\n`))
          } else {
            // Check for errors
            if (statusData.error) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Generation failed: ${JSON.stringify(statusData.error)}` })}\n\n`))
              controller.close()
              return
            }

            // Extract video URIs
            const generatedVideos = statusData.response?.generatedVideos || []

            if (generatedVideos.length === 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'No videos were generated' })}\n\n`))
              controller.close()
              return
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'Downloading videos...' })}\n\n`))

            // Download videos and convert to data URLs
            const videoDataUrls: string[] = []

            for (let i = 0; i < generatedVideos.length; i++) {
              const videoUri = generatedVideos[i].video?.uri

              if (!videoUri) {
                continue
              }

              // Extract file name from URI
              const fileName = videoUri.split('/').pop()

              if (!fileName) {
                continue
              }

              // Download the video
              const downloadUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileName}`
              const downloadResponse = await fetch(downloadUrl, {
                headers: {
                  'x-goog-api-key': apiKey,
                },
              })

              if (downloadResponse.ok) {
                const videoBlob = await downloadResponse.arrayBuffer()
                const base64 = Buffer.from(videoBlob).toString('base64')
                const dataUrl = `data:video/mp4;base64,${base64}`
                videoDataUrls.push(dataUrl)
              }
            }

            if (videoDataUrls.length === 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed to download videos' })}\n\n`))
              controller.close()
              return
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ videos: videoDataUrls, status: 'Complete!' })}\n\n`))
            controller.close()
            return
          }
        }

        if (attempts >= maxAttempts) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Video generation timed out' })}\n\n`))
          controller.close()
        }

      } catch (error: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
