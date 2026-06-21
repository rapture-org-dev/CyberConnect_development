import { createPublicKey, verify } from 'node:crypto'

const DISCORD_ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const DISCORD_SIGNATURE_MAX_SKEW_SECONDS = 5 * 60

function publicKeyFromDiscordHex(publicKeyHex: string) {
  const publicKeyBytes = Buffer.from(publicKeyHex, 'hex')
  if (publicKeyBytes.length !== 32) {
    throw new Error('DISCORD_PUBLIC_KEY must be a 32-byte hex string')
  }

  return createPublicKey({
    key: Buffer.concat([DISCORD_ED25519_SPKI_PREFIX, publicKeyBytes]),
    format: 'der',
    type: 'spki',
  })
}

export function verifyDiscordRequestSignature(params: {
  publicKeyHex: string
  signatureHex: string | null
  timestamp: string | null
  rawBody: string
}) {
  const { publicKeyHex, signatureHex, timestamp, rawBody } = params
  if (!signatureHex || !timestamp) return false
  if (!isDiscordTimestampFresh(timestamp)) return false

  try {
    const signature = Buffer.from(signatureHex, 'hex')
    const signedPayload = Buffer.from(`${timestamp}${rawBody}`, 'utf8')
    return verify(null, signedPayload, publicKeyFromDiscordHex(publicKeyHex), signature)
  } catch {
    return false
  }
}

export function isDiscordTimestampFresh(timestamp: string, nowMs = Date.now()) {
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds)) return false

  const skewSeconds = Math.abs(nowMs / 1000 - timestampSeconds)
  return skewSeconds < DISCORD_SIGNATURE_MAX_SKEW_SECONDS
}
