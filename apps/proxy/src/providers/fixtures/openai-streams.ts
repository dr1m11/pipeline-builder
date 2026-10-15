import { TEST_API_KEY } from './fake-upstream';

// Responses of the OpenAI Responses API to `POST /v1/responses` with `stream: true`, as they come
// over the wire. Event order, field order and ids follow the streams and error bodies documented
// at https://developers.openai.com/api/reference/resources/responses/methods/create and in the
// streaming events reference (no API key was at hand to record live ones); the texts are made up.
// GPT-6 Luna reasons first, so a reasoning item comes before the message.

/** The text `OPENAI_ANSWER` streams, with characters of two to four bytes in UTF-8. */
export const OPENAI_ANSWER_TEXT = 'The sky is blue: небо голубое, 天空是蓝色的 🌍✨';

const CREATED = `event: response.created
data: {"type":"response.created","sequence_number":0,"response":{"id":"resp_68f0a1b2c3d4e5f60718293a4b5c6d7e","object":"response","created_at":1760400000,"status":"in_progress","error":null,"incomplete_details":null,"instructions":"Answer in one sentence.","max_output_tokens":512,"model":"gpt-6-luna","output":[],"reasoning":{"effort":"low","summary":null},"store":false,"text":{"format":{"type":"text"}},"usage":null,"metadata":{}}}

event: response.in_progress
data: {"type":"response.in_progress","sequence_number":1,"response":{"id":"resp_68f0a1b2c3d4e5f60718293a4b5c6d7e","object":"response","created_at":1760400000,"status":"in_progress","error":null,"incomplete_details":null,"instructions":"Answer in one sentence.","max_output_tokens":512,"model":"gpt-6-luna","output":[],"reasoning":{"effort":"low","summary":null},"store":false,"text":{"format":{"type":"text"}},"usage":null,"metadata":{}}}

event: response.output_item.added
data: {"type":"response.output_item.added","sequence_number":2,"output_index":0,"item":{"id":"rs_68f0a1b2c3d4e5f6","type":"reasoning","summary":[]}}

event: response.output_item.done
data: {"type":"response.output_item.done","sequence_number":3,"output_index":0,"item":{"id":"rs_68f0a1b2c3d4e5f6","type":"reasoning","summary":[]}}

`;

const MESSAGE_STARTED = `event: response.output_item.added
data: {"type":"response.output_item.added","sequence_number":4,"output_index":1,"item":{"id":"msg_68f0a1b3d4e5f607","type":"message","status":"in_progress","role":"assistant","content":[]}}

event: response.content_part.added
data: {"type":"response.content_part.added","sequence_number":5,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"part":{"type":"output_text","text":"","annotations":[],"logprobs":[]}}

`;

/** A whole answer: reasoning, then a message, then `response.completed`. */
export const OPENAI_ANSWER = `${CREATED}${MESSAGE_STARTED}event: response.output_text.delta
data: {"type":"response.output_text.delta","sequence_number":6,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"delta":"The sky is blue: ","logprobs":[]}

event: response.output_text.delta
data: {"type":"response.output_text.delta","sequence_number":7,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"delta":"небо голубое, ","logprobs":[]}

event: response.output_text.delta
data: {"type":"response.output_text.delta","sequence_number":8,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"delta":"天空是蓝色的 🌍✨","logprobs":[]}

event: response.output_text.done
data: {"type":"response.output_text.done","sequence_number":9,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"text":"The sky is blue: небо голубое, 天空是蓝色的 🌍✨","logprobs":[]}

event: response.content_part.done
data: {"type":"response.content_part.done","sequence_number":10,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"part":{"type":"output_text","text":"The sky is blue: небо голубое, 天空是蓝色的 🌍✨","annotations":[],"logprobs":[]}}

event: response.output_item.done
data: {"type":"response.output_item.done","sequence_number":11,"output_index":1,"item":{"id":"msg_68f0a1b3d4e5f607","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"The sky is blue: небо голубое, 天空是蓝色的 🌍✨","annotations":[],"logprobs":[]}]}}

event: response.completed
data: {"type":"response.completed","sequence_number":12,"response":{"id":"resp_68f0a1b2c3d4e5f60718293a4b5c6d7e","object":"response","created_at":1760400000,"status":"completed","error":null,"incomplete_details":null,"instructions":"Answer in one sentence.","max_output_tokens":512,"model":"gpt-6-luna","output":[{"id":"rs_68f0a1b2c3d4e5f6","type":"reasoning","summary":[]},{"id":"msg_68f0a1b3d4e5f607","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"The sky is blue: небо голубое, 天空是蓝色的 🌍✨","annotations":[],"logprobs":[]}]}],"reasoning":{"effort":"low","summary":null},"store":false,"text":{"format":{"type":"text"}},"usage":{"input_tokens":21,"input_tokens_details":{"cached_tokens":0},"output_tokens":40,"output_tokens_details":{"reasoning_tokens":12},"total_tokens":61},"metadata":{}}}

`;

/** Reasoning used up `max_output_tokens` before any text. */
export const OPENAI_INCOMPLETE_WHILE_REASONING = `${CREATED}event: response.incomplete
data: {"type":"response.incomplete","sequence_number":4,"response":{"id":"resp_68f0a1b2c3d4e5f60718293a4b5c6d7e","object":"response","created_at":1760400000,"status":"incomplete","error":null,"incomplete_details":{"reason":"max_output_tokens"},"model":"gpt-6-luna","output":[{"id":"rs_68f0a1b2c3d4e5f6","type":"reasoning","summary":[]}],"usage":{"input_tokens":21,"output_tokens":16,"output_tokens_details":{"reasoning_tokens":16},"total_tokens":37}}}

`;

/** Text, then the end of the response because it reached `max_output_tokens`. */
export const OPENAI_INCOMPLETE_AFTER_TEXT = `${CREATED}${MESSAGE_STARTED}event: response.output_text.delta
data: {"type":"response.output_text.delta","sequence_number":6,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"delta":"The sky is","logprobs":[]}

event: response.incomplete
data: {"type":"response.incomplete","sequence_number":7,"response":{"id":"resp_68f0a1b2c3d4e5f60718293a4b5c6d7e","object":"response","created_at":1760400000,"status":"incomplete","error":null,"incomplete_details":{"reason":"max_output_tokens"},"model":"gpt-6-luna","usage":{"input_tokens":21,"output_tokens":16,"output_tokens_details":{"reasoning_tokens":12},"total_tokens":37}}}

`;

/** The model declined: its message holds a refusal instead of text. */
export const OPENAI_REFUSAL = `${CREATED}event: response.output_item.added
data: {"type":"response.output_item.added","sequence_number":4,"output_index":1,"item":{"id":"msg_68f0a1b3d4e5f607","type":"message","status":"in_progress","role":"assistant","content":[]}}

event: response.content_part.added
data: {"type":"response.content_part.added","sequence_number":5,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"part":{"type":"refusal","refusal":""}}

event: response.refusal.delta
data: {"type":"response.refusal.delta","sequence_number":6,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"delta":"I can't help with that."}

event: response.refusal.done
data: {"type":"response.refusal.done","sequence_number":7,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"refusal":"I can't help with that."}

event: response.content_part.done
data: {"type":"response.content_part.done","sequence_number":8,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"part":{"type":"refusal","refusal":"I can't help with that."}}

event: response.output_item.done
data: {"type":"response.output_item.done","sequence_number":9,"output_index":1,"item":{"id":"msg_68f0a1b3d4e5f607","type":"message","status":"completed","role":"assistant","content":[{"type":"refusal","refusal":"I can't help with that."}]}}

event: response.completed
data: {"type":"response.completed","sequence_number":10,"response":{"id":"resp_68f0a1b2c3d4e5f60718293a4b5c6d7e","object":"response","created_at":1760400000,"status":"completed","error":null,"incomplete_details":null,"model":"gpt-6-luna","usage":{"input_tokens":21,"output_tokens":9,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":30}}}

`;

/** The content filter stopped the response. */
export const OPENAI_CONTENT_FILTERED = `${CREATED}event: response.incomplete
data: {"type":"response.incomplete","sequence_number":4,"response":{"id":"resp_68f0a1b2c3d4e5f60718293a4b5c6d7e","object":"response","created_at":1760400000,"status":"incomplete","error":null,"incomplete_details":{"reason":"content_filter"},"model":"gpt-6-luna","usage":null}}

`;

/** Text, then `response.failed`: the model failed in the middle of the answer. */
export const OPENAI_FAILED_MIDWAY = `${CREATED}${MESSAGE_STARTED}event: response.output_text.delta
data: {"type":"response.output_text.delta","sequence_number":6,"item_id":"msg_68f0a1b3d4e5f607","output_index":1,"content_index":0,"delta":"The sky","logprobs":[]}

event: response.failed
data: {"type":"response.failed","sequence_number":7,"response":{"id":"resp_68f0a1b2c3d4e5f60718293a4b5c6d7e","object":"response","created_at":1760400000,"status":"failed","error":{"code":"server_error","message":"The model failed to generate a response."},"incomplete_details":null,"model":"gpt-6-luna","usage":null}}

`;

/** An `error` event in the stream, with its fields in the event itself. */
export const OPENAI_ERROR_EVENT = `${CREATED}event: error
data: {"type":"error","code":"rate_limit_exceeded","message":"Rate limit reached for gpt-6-luna in organization org-123 on tokens per min (TPM): Limit 30000, Used 30000, Requested 120.","param":null,"sequence_number":4}

`;

/**
 * Error bodies of the API by HTTP status. Some of their messages repeat parts of the request, and
 * the 401 quotes the test key in full (the real one masks most of it), so tests can check that no
 * message the proxy writes repeats either.
 */
export const OPENAI_ERROR_BODIES = {
  400: '{"error":{"message":"Invalid \'max_output_tokens\' for the prompt \\"Why is the sky blue?\\": integer below minimum value.","type":"invalid_request_error","param":"max_output_tokens","code":"integer_below_min_value"}}',
  401: `{"error":{"message":"Incorrect API key provided: ${TEST_API_KEY}. You can find your API key at https://platform.openai.com/account/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}`,
  403: '{"error":{"message":"Project does not have access to model gpt-6-luna.","type":"invalid_request_error","param":null,"code":"model_not_found"}}',
  429: '{"error":{"message":"Rate limit reached for gpt-6-luna in organization org-123 on requests per min (RPM): Limit 500, Used 500, Requested 1.","type":"requests","param":null,"code":"rate_limit_exceeded"}}',
  500: '{"error":{"message":"The server had an error while processing your request. Sorry about that!","type":"server_error","param":null,"code":null}}',
  503: '{"error":{"message":"The engine is currently overloaded, please try again later.","type":"server_error","param":null,"code":null}}',
} as const;

/** The account of the key has used up its quota (429 `insufficient_quota`). */
export const OPENAI_QUOTA_BODY =
  '{"error":{"message":"Retrying billing, spend, or quota errors won\'t restore API access. Update the relevant credits or limits before sending another request.","type":"insufficient_quota","param":null,"code":"insufficient_quota"}}';

/** The organization has no prepaid credits left: a newer billing code under the same type. */
export const OPENAI_CREDIT_EXHAUSTED_BODY =
  '{"error":{"message":"Your organization has no prepaid credits remaining.","type":"insufficient_quota","param":null,"code":"credit_balance_exhausted"}}';
