import { TEST_API_KEY } from './fake-upstream';

// Responses of the Anthropic Messages API to `POST /v1/messages` with `stream: true`, as they come
// over the wire. Event order, field order and ids follow the streams and error bodies documented
// at https://platform.claude.com/docs/en/build-with-claude/streaming and
// https://platform.claude.com/docs/en/api/errors (no API key was at hand to record live ones); the
// texts are made up. Claude Haiku 5.5 thinks by default and, unless the request asks for a summary
// (`display: "summarized"`), sends its thinking block with an empty `thinking` field and only a
// signature.

/** The text `ANTHROPIC_ANSWER` streams, with characters of two to four bytes in UTF-8. */
export const ANTHROPIC_ANSWER_TEXT = 'The sky is blue: небо голубое, 天空是蓝色的 🌍✨';

/**
 * A whole answer: thinking, then a text block, then the end of the message. Its thinking block
 * carries a summary, as with `display: "summarized"`, so tests can check that thinking text never
 * reaches the answer.
 */
export const ANTHROPIC_ANSWER = `event: message_start
data: {"type":"message_start","message":{"id":"msg_01XFDUDYJgAACzvnptvVoYEL","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":21,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Short question, short answer."}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

event: ping
data: {"type": "ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"The sky is blue: "}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"небо голубое, "}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"天空是蓝色的 🌍✨"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":24}}

event: message_stop
data: {"type":"message_stop"}

`;

/** Text, then an `error` event: the API became overloaded in the middle of the answer. */
export const ANTHROPIC_OVERLOADED_MIDWAY = `event: message_start
data: {"type":"message_start","message":{"id":"msg_01Dm8bWv3WQ3xHVuFwbyUvGT","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":21,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"The sky"}}

event: error
data: {"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}

`;

/** The model thought until it reached `max_tokens`, so the answer has no text. */
export const ANTHROPIC_MAX_TOKENS_WHILE_THINKING = `event: message_start
data: {"type":"message_start","message":{"id":"msg_01Qe4c5mXKbJbCV3Z1mH3k5N","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":21,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"EqQBCgIYAhIMGsGZnTcwV2WjmqXhGgw2CXlP7Qd3iZ6K2PEiMHvHO"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":16}}

event: message_stop
data: {"type":"message_stop"}

`;

/** Text, then the end of the message because it reached `max_tokens`. */
export const ANTHROPIC_MAX_TOKENS_AFTER_TEXT = `event: message_start
data: {"type":"message_start","message":{"id":"msg_01HBqBnGq8xNvLzFkXH5eYvT","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":21,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"The sky is"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":4}}

event: message_stop
data: {"type":"message_stop"}

`;

/** The safety classifiers declined the prompt. */
export const ANTHROPIC_REFUSAL = `event: message_start
data: {"type":"message_start","message":{"id":"msg_01MZ2HTAy1R5q6dWWsJ7vzFq","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":21,"output_tokens":1}}}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"refusal","stop_sequence":null,"stop_details":{"type":"refusal","category":null,"explanation":null}},"usage":{"output_tokens":1}}

event: message_stop
data: {"type":"message_stop"}

`;

/**
 * Error bodies of the API by HTTP status. Some of their messages repeat parts of the request, and
 * the 401 quotes the test key in full (the real one leaves it out), so tests can check that no
 * message the proxy writes repeats either.
 */
export const ANTHROPIC_ERROR_BODIES = {
  400: '{"type":"error","error":{"type":"invalid_request_error","message":"model: claude-haiku-9 was not found for the prompt \\"Why is the sky blue?\\""},"request_id":"req_011CSHoEeqs5C35K2UUqR7Fy"}',
  401: `{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key: ${TEST_API_KEY}"},"request_id":"req_011CSHoEeqs5C35K2UUqR7Fz"}`,
  402: '{"type":"error","error":{"type":"billing_error","message":"There is an issue with the billing or payment information of your account."},"request_id":"req_011CSHoEeqs5C35K2UUqR7G4"}',
  403: '{"type":"error","error":{"type":"permission_error","message":"Your API key does not have permission to use the specified resource."},"request_id":"req_011CSHoEeqs5C35K2UUqR7G0"}',
  429: '{"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"},"request_id":"req_011CSHoEeqs5C35K2UUqR7G1"}',
  500: '{"type":"error","error":{"type":"api_error","message":"Internal server error"},"request_id":"req_011CSHoEeqs5C35K2UUqR7G2"}',
  529: '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},"request_id":"req_011CSHoEeqs5C35K2UUqR7G3"}',
} as const;

/** A spend limit the organization set was reached (400, told apart only by its message). */
export const ANTHROPIC_SPEND_LIMIT_BODY =
  '{"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."},"request_id":"req_011CSHoEeqs5C35K2UUqR7G5"}';

/** The same for a workspace's spend limit. */
export const ANTHROPIC_WORKSPACE_SPEND_LIMIT_BODY =
  '{"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."},"request_id":"req_011CSHoEeqs5C35K2UUqR7G6"}';

/** The monthly spend cap of the usage tier was reached (429 without `retry-after`). */
export const ANTHROPIC_SPEND_CAP_BODY =
  '{"type":"error","error":{"type":"rate_limit_error","message":"You have reached your API usage limits: your organization has crossed its monthly API usage threshold, set based on your organization\'s API tier. You will regain access on 2026-11-01 at 00:00 UTC.","details":{"error_code":"enforced_spend_limit_reached"}},"request_id":"req_018EeWyXxfu5pfWkrYcMdjWG"}';
