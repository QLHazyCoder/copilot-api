import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils"
import { z } from "zod/v4"

const openaiErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),

    // The additional information below is handled loosely to support
    // OpenAI-compatible providers that have slightly different error
    // responses:
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
})

export type OpenAIErrorData = z.infer<typeof openaiErrorDataSchema>

export const openaiFailedResponseHandler: ReturnType<
  typeof createJsonErrorResponseHandler<OpenAIErrorData>
> = createJsonErrorResponseHandler({
  errorSchema: openaiErrorDataSchema,
  errorToMessage: (data) => data.error.message,
})
