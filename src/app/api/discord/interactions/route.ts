import { NextResponse } from 'next/server'
import {
  buildIssueFromDiscordRequest,
  isDiscordRequestCommand,
  type DiscordInteractionPayload,
} from '@/server/discord/requestIssue'
import { verifyDiscordRequestSignature } from '@/server/discord/verify'
import { createGitHubIssue } from '@/server/github/issues'

export const runtime = 'nodejs'

const DISCORD_INTERACTION_PING = 1
const DISCORD_INTERACTION_APPLICATION_COMMAND = 2
const DISCORD_RESPONSE_PONG = 1
const DISCORD_RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE = 4
const DISCORD_MESSAGE_FLAG_EPHEMERAL = 64

function discordMessage(content: string, status = 200) {
  return NextResponse.json(
    {
      type: DISCORD_RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content,
        flags: DISCORD_MESSAGE_FLAG_EPHEMERAL,
      },
    },
    { status },
  )
}

function forbiddenByAllowlist(payload: DiscordInteractionPayload) {
  const allowedGuildId = process.env.DISCORD_ALLOWED_GUILD_ID
  const allowedChannelId = process.env.DISCORD_ALLOWED_CHANNEL_ID

  if (allowedGuildId && payload.guild_id !== allowedGuildId) {
    return 'This Discord server is not allowed to create GitHub issues.'
  }

  if (allowedChannelId && payload.channel_id !== allowedChannelId) {
    return 'This Discord channel is not allowed to create GitHub issues.'
  }

  return null
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json({ error: 'DISCORD_PUBLIC_KEY is required' }, { status: 500 })
  }

  const rawBody = await request.text()
  const isValidSignature = verifyDiscordRequestSignature({
    publicKeyHex: publicKey,
    signatureHex: request.headers.get('x-signature-ed25519'),
    timestamp: request.headers.get('x-signature-timestamp'),
    rawBody,
  })

  if (!isValidSignature) {
    return NextResponse.json({ error: 'invalid request signature' }, { status: 401 })
  }

  let payload: DiscordInteractionPayload
  try {
    payload = JSON.parse(rawBody) as DiscordInteractionPayload
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (payload.type === DISCORD_INTERACTION_PING) {
    return NextResponse.json({ type: DISCORD_RESPONSE_PONG })
  }

  if (payload.type !== DISCORD_INTERACTION_APPLICATION_COMMAND) {
    return discordMessage('Unsupported Discord interaction type.', 400)
  }

  if (!isDiscordRequestCommand(payload)) {
    return discordMessage('Unsupported Discord command.', 400)
  }

  const forbiddenReason = forbiddenByAllowlist(payload)
  if (forbiddenReason) return discordMessage(forbiddenReason, 403)

  try {
    const issueInput = buildIssueFromDiscordRequest(payload)
    const issue = await createGitHubIssue(issueInput)
    return discordMessage(`GitHub issue #${issue.number} created: ${issue.htmlUrl}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return discordMessage(`Failed to create GitHub issue: ${message}`, 500)
  }
}
