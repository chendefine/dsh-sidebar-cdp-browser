import { z } from 'zod'

export const PROTOCOL_VERSION = 1 as const

const targetKeySchema = z.string().min(16).max(256)
const requestIdSchema = z.string().min(1).max(128)

export const screencastOptionsSchema = z.object({
  format: z.enum(['jpeg', 'png']).optional(),
  quality: z.number().int().min(20).max(90).optional(),
  maxWidth: z.number().int().positive().max(3840).optional(),
  maxHeight: z.number().int().positive().max(2160).optional(),
  everyNthFrame: z.number().int().positive().max(30).optional(),
}).strict()

const mouseEventSchema = z.object({
  type: z.enum(['mousePressed', 'mouseReleased', 'mouseMoved', 'mouseWheel']),
  x: z.number().finite(),
  y: z.number().finite(),
  button: z.enum(['none', 'left', 'middle', 'right', 'back', 'forward']).optional(),
  buttons: z.number().int().nonnegative().optional(),
  clickCount: z.number().int().nonnegative().max(4).optional(),
  deltaX: z.number().finite().optional(),
  deltaY: z.number().finite().optional(),
  modifiers: z.number().int().min(0).max(15).optional(),
}).strict()

export const clientRequestSchema = z.discriminatedUnion('type', [
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('targets.list'), requestId: requestIdSchema }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('targets.create'), requestId: requestIdSchema }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('target.select'), requestId: requestIdSchema, targetKey: targetKeySchema }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('target.detach'), requestId: requestIdSchema, targetKey: targetKeySchema }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('target.close'), requestId: requestIdSchema, targetKey: targetKeySchema }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('visibility'), requestId: requestIdSchema, targetKey: targetKeySchema.optional(), visible: z.boolean() }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('screencast.start'), requestId: requestIdSchema, targetKey: targetKeySchema, options: screencastOptionsSchema.optional() }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('screencast.stop'), requestId: requestIdSchema, targetKey: targetKeySchema }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('input.mouse'), requestId: requestIdSchema, targetKey: targetKeySchema, frameId: z.number().int().nonnegative().optional(), event: mouseEventSchema }).strict(),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal('input.key'),
    requestId: requestIdSchema,
    targetKey: targetKeySchema,
    event: z.object({
      type: z.enum(['keyDown', 'keyUp', 'rawKeyDown', 'char']),
      key: z.string().max(128).optional(),
      code: z.string().max(128).optional(),
      text: z.string().max(65_536).optional(),
      unmodifiedText: z.string().max(65_536).optional(),
      windowsVirtualKeyCode: z.number().int().optional(),
      nativeVirtualKeyCode: z.number().int().optional(),
      modifiers: z.number().int().min(0).max(15).optional(),
      autoRepeat: z.boolean().optional(),
      isKeypad: z.boolean().optional(),
      isSystemKey: z.boolean().optional(),
      location: z.number().int().min(0).max(3).optional(),
    }).strict(),
  }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('input.text'), requestId: requestIdSchema, targetKey: targetKeySchema, text: z.string().max(1_000_000) }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('navigate'), requestId: requestIdSchema, targetKey: targetKeySchema, url: z.string().url().max(8192) }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('history'), requestId: requestIdSchema, targetKey: targetKeySchema, action: z.enum(['back', 'forward', 'reload']) }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('ping'), requestId: requestIdSchema }).strict(),
])

const targetDescriptorSchema = z.object({
  key: targetKeySchema,
  type: z.string(),
  title: z.string(),
  url: z.string(),
  lifecycle: z.enum(['available', 'attached', 'closed']),
  attached: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
}).strict()

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('ready'), generation: z.string(), mode: z.enum(['observe', 'interactive']), targets: z.array(targetDescriptorSchema) }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('response'), requestId: requestIdSchema, ok: z.boolean(), result: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string() }).strict().optional() }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('targets.changed'), targets: z.array(targetDescriptorSchema) }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('target.closed'), targetKey: targetKeySchema, reason: z.string().optional() }).strict(),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal('screencast.frameMeta'),
    targetKey: targetKeySchema,
    sequence: z.number().int().nonnegative(),
    metadata: z.record(z.string(), z.unknown()),
    mimeType: z.enum(['image/jpeg', 'image/png']),
    byteLength: z.number().int().nonnegative(),
    receivedAt: z.number(),
  }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal('error'), code: z.string(), message: z.string(), recoverable: z.boolean() }).strict(),
])

export type ClientRequest = z.infer<typeof clientRequestSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>

export function parseClientRequest(value: unknown): ClientRequest {
  return clientRequestSchema.parse(value)
}

export function parseJsonClientRequest(input: string | Buffer): ClientRequest {
  const text = typeof input === 'string' ? input : input.toString('utf8')
  return parseClientRequest(JSON.parse(text) as unknown)
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(serverMessageSchema.parse(message))
}
