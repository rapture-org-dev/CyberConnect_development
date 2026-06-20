import { createPublicKey, verify } from 'node:crypto'

const DISCORD_ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

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

  try {
    const signature = Buffer.from(signatureHex, 'hex')
    const signedPayload = Buffer.from(`${timestamp}${rawBody}`, 'utf8')
    return verify(null, signedPayload, publicKeyFromDiscordHex(publicKeyHex), signature)
  } catch {
    return false
  }
}
