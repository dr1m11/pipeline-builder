/**
 * A pipeline file saved by the released version 1 app, byte for byte: Input → Prompt → LLM Call
 * (temperature 0.3) → Output. It was exported with the Export button from production
 * (https://pipeline-builder.marat-gabdrashitov17.workers.dev, deployed from commit 01f2d4b) on
 * 2026-10-14. The same file is `apps/web/e2e/fixtures/pipeline-v1.json`. Never edit it: it stands
 * for the files users already have.
 */
export const PIPELINE_V1 = `{
  "format": "pipeline-builder",
  "schemaVersion": 1,
  "id": "draft",
  "name": "Untitled pipeline",
  "nodes": [
    {
      "id": "4e6b0ae2-5f25-4e7e-9e25-9cab32a374ac",
      "kind": "input",
      "label": "Input 1",
      "position": {
        "x": 312,
        "y": 344.5
      },
      "data": {
        "valueType": "text",
        "value": ""
      }
    },
    {
      "id": "93a2fee4-375c-44fe-99d5-4be380b05770",
      "kind": "prompt",
      "label": "Prompt 1",
      "position": {
        "x": 592,
        "y": 344.5
      },
      "data": {
        "template": "Answer the question: {{question}}"
      }
    },
    {
      "id": "9a307aad-e2d1-4573-8333-51e0659b4284",
      "kind": "llm-call",
      "label": "LLM Call 1",
      "position": {
        "x": 32,
        "y": 344.5
      },
      "data": {
        "model": "mock",
        "temperature": 0.3,
        "maxTokens": 512
      }
    },
    {
      "id": "115b1268-2dbb-4a41-b1af-125443d862dd",
      "kind": "output",
      "label": "Output 1",
      "position": {
        "x": 592,
        "y": 144.5
      },
      "data": {
        "format": "text"
      }
    }
  ],
  "edges": [
    {
      "id": "aa196926-7e0c-4e63-a882-7891d7e2ff8a",
      "source": "4e6b0ae2-5f25-4e7e-9e25-9cab32a374ac",
      "sourcePort": "value",
      "target": "93a2fee4-375c-44fe-99d5-4be380b05770",
      "targetPort": "question"
    },
    {
      "id": "5e5d4f77-646c-4762-bd78-124469492bd2",
      "source": "93a2fee4-375c-44fe-99d5-4be380b05770",
      "sourcePort": "prompt",
      "target": "9a307aad-e2d1-4573-8333-51e0659b4284",
      "targetPort": "prompt"
    },
    {
      "id": "ae275e61-3473-45a2-8231-d15379cdc16b",
      "source": "9a307aad-e2d1-4573-8333-51e0659b4284",
      "sourcePort": "response",
      "target": "115b1268-2dbb-4a41-b1af-125443d862dd",
      "targetPort": "value"
    }
  ]
}
`;
