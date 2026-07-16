export const DISCORD_REQUEST_COMMAND_NAME = 'request'

export const DISCORD_REQUEST_ISSUE_LABELS = [
  'source:discord',
  'cursor-agent',
  'target:staging',
]

type DiscordCommandOption = {
  name: string
  value?: string | number | boolean
}

export type DiscordInteractionPayload = {
  id?: string
  type: number
  guild_id?: string
  channel_id?: string
  token?: string
  data?: {
    name?: string
    options?: DiscordCommandOption[]
  }
  member?: {
    user?: {
      id?: string
      username?: string
      global_name?: string | null
    }
  }
  user?: {
    id?: string
    username?: string
    global_name?: string | null
  }
}

export type DiscordRequestIssue = {
  title: string
  body: string
  labels: string[]
}

function optionValue(payload: DiscordInteractionPayload, name: string) {
  return payload.data?.options?.find((option) => option.name === name)?.value
}

function stringOption(payload: DiscordInteractionPayload, name: string) {
  const value = optionValue(payload, name)
  return typeof value === 'string' ? value.trim() : ''
}

function discordUser(payload: DiscordInteractionPayload) {
  return payload.member?.user ?? payload.user
}

function optionalSection(title: string, value: string) {
  if (!value) return ''
  return `\n## ${title}\n\n${value}\n`
}

export function buildIssueFromDiscordRequest(
  payload: DiscordInteractionPayload,
): DiscordRequestIssue {
  const title = stringOption(payload, 'title')
  const description = stringOption(payload, 'description')
  const priority = stringOption(payload, 'priority') || 'not specified'
  const requestType = stringOption(payload, 'type') || 'not specified'
  const acceptanceCriteria = stringOption(payload, 'acceptance_criteria')
  const user = discordUser(payload)
  const displayName = user?.global_name || user?.username || 'unknown'

  if (!title || !description) {
    throw new Error('title and description are required')
  }

  return {
    title,
    labels: DISCORD_REQUEST_ISSUE_LABELS,
    body: `## Request from Discord

- Reporter: ${displayName}
- Discord User ID: ${user?.id ?? 'unknown'}
- Guild ID: ${payload.guild_id ?? 'unknown'}
- Channel ID: ${payload.channel_id ?? 'unknown'}
- Priority: ${priority}
- Type: ${requestType}

## Request

${description}
${optionalSection('Acceptance Criteria', acceptanceCriteria)}
## Cursor Agent Instructions

- Implement this issue for the staging branch.
- Create a pull request targeting staging.
- Do not implement automatic execution from Discord for this request.
- Follow the existing Next.js App Router and TypeScript patterns in this repository.
- Include local test results or verification notes in the pull request.
`,
  }
}

export function isDiscordRequestCommand(payload: DiscordInteractionPayload) {
  return payload.data?.name === DISCORD_REQUEST_COMMAND_NAME
}
