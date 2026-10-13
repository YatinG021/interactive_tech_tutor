import type { JsonSchemaFormat } from "./llm.js";

/*
 * Prompts for the GPT-4.1 family. Conventions used throughout:
 *  - the long, static rules live in the system message and come first, so Azure OpenAI's automatic
 *    prompt caching can reuse them across the parallel per-step calls;
 *  - the task-specific text goes last in the user message, where this model family follows it best;
 *  - the element vocabulary is spelled out (the renderer only understands these fields);
 *  - small outputs are constrained with Structured Outputs instead of "return only JSON" pleading.
 */

export interface OutlineStep {
  step: number;
  concept: string;
  subtitle: string;
  visual_plan: string;
}

// ---------- simulation outline (call 1, small, structured) ----------

export const OUTLINE_SYSTEM_PROMPT = `You are a senior technical educator who writes narrated, step-by-step visual explainers. A narrator reads each subtitle aloud while an animated diagram plays, so the writing must sound natural when spoken and be easy to draw.`;

export const OUTLINE_SCHEMA: JsonSchemaFormat = {
  name: "simulation_outline",
  schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "integer" },
            concept: { type: "string" },
            subtitle: { type: "string" },
            visual_plan: { type: "string" }
          },
          required: ["step", "concept", "subtitle", "visual_plan"],
          additionalProperties: false
        }
      }
    },
    required: ["steps"],
    additionalProperties: false
  }
};

export function buildOutlinePrompt(topic: string, level: string, depth: string): string {
  return `Topic: ${topic}
Audience level: ${level} (focus on ${depth}).

Write the explainer as 6 to 8 steps.

For every step provide:
- concept: a 2-5 word name for the step.
- subtitle: 3-4 complete sentences of plain spoken English, 25-60 words in total, one idea per sentence. Build on the previous step.
- visual_plan: 1-2 sentences written for the diagram artist. Name the shapes to draw with their exact labels and values, which element is highlighted, and what moves. It must show everything the subtitle states.

Rules:
1. Choose ONE concrete running example (specific numbers, names or values) in step 1 and reuse it in later steps, so the diagram can show it.
2. Step 1 defines the idea and sets up the example. Middle steps walk through the mechanism one stage at a time. The last step states the result and why it matters (complexity, trade-off or real use).
3. Facts must be correct. Prefer a small worked example over abstract description.`;
}

// ---------- per-step canvas elements (call 2, run in parallel) ----------

export const ELEMENT_SYSTEM_PROMPT = `You design the animated canvas for ONE step of a narrated technical explainer. The student watches the canvas while a narrator reads the step's subtitle aloud, so every sentence of the subtitle must be visible on the canvas.

# Canvas
- Coordinates are percentages of the canvas: x and y from 0 to 100, origin at the top-left. Keep every element inside 5-95 on both axes.
- width and height are percentages too.
- For circle and plot_point, (x, y) is the CENTER. For every other shape, (x, y) is the TOP-LEFT corner.
- Give every shape a short unique "id" (e.g. "client", "n50", "cell3"). Connect shapes with arrows/lines that name them: {"type":"arrow","from":"client","to":"server"}. The renderer attaches the connector to the shapes' outlines, so do NOT give coordinates to connectors that join shapes.
- Leave clear gaps. Shapes must not overlap, and captions go in free space.

# Element types (use only these, with only these fields)
rectangle         {x,y,width,height,label}                     boxes: components, stages, variables, array cells
circle            {x,y,radius,label}                           nodes, states, points of interest
bar               {x,y,width,height,label,orientation}         one bar of a chart; label is its numeric value; height encodes magnitude; bars in one chart share the same bottom edge (y + height)
tree_node         {value,parent_value,label}                   one node of a binary search tree. NO x or y: the renderer lays the tree out AND draws its edges, so never add lines or arrows between tree nodes. value is a number; parent_value is the parent's value (omit for the root)
arrow             {from,to,label}                              directed flow or data movement between two shapes (ids)
line, dashed_line {from,to,label}                              undirected relation between two shapes (ids)
curved_arrow      {from,to,label}                              e.g. "replaces", "returns to"
text              {x,y,width,height,label}                     short captions only (at most 6 words)
matrix            {x,y,width,height,rows,cols,values}          values is a rows x cols array of numbers or short strings
table             {x,y,width,height,headers,rows}              headers is string[], rows is string[][]
axis              {x,y,width,height,x_label,y_label}           pair with plot_point and line
plot_point        {x,y,label}
flowchart_diamond {x,y,width,height,label}                     a decision
stack, queue      {x,y,width,height,values}                    values is string[]
number_line       {x,y,width,start,end}
neural_network    {x,y,width,height,layers}                    layers is number[] (neurons per layer)
highlight_box     {x,y,width,height}                           translucent outline that draws attention to a group

# Common fields
- color: hex with 6 digits. Palette: base #00D4FF, secondary #8B5CF6, success #22C55E, caution #FACC15, active/emphasis #FF6B35, muted #64748B.
- label: the real term or value, at most 4 words on shapes. Never "Box 1", "Node 2" or similar.
- label_position: above | below | left | right.
- animation: {"type", "duration", "delay"}
  type: fade_in | draw | pulse | highlight | move | swap | scale_up | typewriter | none
  duration: 400-1500 (ms)
  delay: 0-12000 (ms from the start of the step). Order delays so elements appear in the order the subtitle mentions them.
  move and swap also take target_x and target_y (percent).

# Rules
1. Draw what the subtitle says. Every number, name and relation it mentions appears as a labelled element.
2. Every arrow and line must use "from" and "to" with ids of shapes in this step; never leave a connector floating.
3. Draw each thing ONCE. Never place two elements at the same position. To show a change (swap, move, insertion, a value being passed on), animate that single element with move or swap and target_x/target_y: it starts at x,y and ends at the target after its delay. To swap A and B, give A a swap with B's position as target and B a swap with A's position.
4. Show the state the subtitle begins with, then animate toward the state it ends with.
5. The element the subtitle is currently about gets #FF6B35. When two things are compared, give them two clearly different colours.
6. Pick the structure that fits: ordered values -> bars; hierarchy -> tree_node; flow or pipeline -> rectangles joined by arrows; grid -> matrix; relationship or function -> axis + plot_point + line; choice -> flowchart_diamond.
7. Layout recipes:
   - A list or array of n values is ONE horizontal row of equal cells: width w = min(14, 70/n), gap 2, first x = (100 - n*w - (n-1)*2) / 2, y = 40. Bars in a row share the same bottom edge.
   - A pipeline runs left to right on one row at y of about 45, with arrows between boxes.
   - Captions sit above (y 8-15) or below (y 80-90) the main figure, never inside it.
8. Use 6-10 elements, at least 3 of them not text. Arrows must connect elements that exist.
9. Stay consistent with the visual plan and the other steps: same values, same names, same order.
10. Reply with one JSON object {"elements":[ ... ]} and nothing else.

# Example
Subtitle: "The array holds 5, 2 and 9. Merge sort compares 5 and 2, then swaps them so 2 comes first."
Visual plan: Three bars 5, 2, 9 in a row; highlight 5 and 2, then swap those two bars.
{"elements":[
{"type":"text","x":25,"y":10,"width":50,"height":6,"label":"Compare and swap","color":"#64748B","animation":{"type":"fade_in","duration":500,"delay":0}},
{"id":"b5","type":"bar","x":25,"y":35,"width":14,"height":30,"label":"5","color":"#FF6B35","label_position":"below","animation":{"type":"swap","duration":1200,"delay":5000,"target_x":45,"target_y":35}},
{"id":"b2","type":"bar","x":45,"y":51,"width":14,"height":14,"label":"2","color":"#8B5CF6","label_position":"below","animation":{"type":"swap","duration":1200,"delay":5000,"target_x":25,"target_y":51}},
{"id":"b9","type":"bar","x":65,"y":20,"width":14,"height":45,"label":"9","color":"#00D4FF","label_position":"below","animation":{"type":"fade_in","duration":600,"delay":1500}},
{"type":"highlight_box","x":22,"y":30,"width":40,"height":40,"color":"#FACC15","animation":{"type":"pulse","duration":900,"delay":2500}},
{"type":"text","x":25,"y":82,"width":50,"height":6,"label":"5 > 2, so swap","color":"#FACC15","animation":{"type":"fade_in","duration":600,"delay":4000}},
{"type":"arrow","from":"b5","to":"b2","label":"compare","color":"#FACC15","animation":{"type":"draw","duration":700,"delay":3000}}
]}`;

export function buildElementPrompt(args: {
  topic: string;
  level: string;
  outline: OutlineStep[];
  target: OutlineStep;
}): string {
  const { topic, level, outline, target } = args;
  const overview = outline
    .map((item) => `${item.step}. ${item.concept}: ${item.subtitle}\n   Visual plan: ${item.visual_plan}`)
    .join("\n");
  return `Topic: ${topic}
Audience level: ${level}

Full outline, for continuity of data and naming (draw only the target step):
${overview}

TARGET STEP ${target.step}: ${target.concept}
Subtitle: ${target.subtitle}
Visual plan: ${target.visual_plan}

Design the canvas for the target step only. Reply with {"elements":[...]}.`;
}

export function buildImproveStepPrompt(args: {
  topic: string;
  level: string;
  step: { step: number; concept: string; subtitle: string };
  visualPlan: string;
  currentElements: unknown[];
}): string {
  const { topic, level, step, visualPlan, currentElements } = args;
  return `Topic: ${topic}
Audience level: ${level}

The draft canvas for this step is weak: labels are generic or missing, numbers from the subtitle are not shown, or the visuals do not match what is narrated. Redesign it.

STEP ${step.step}: ${step.concept}
Subtitle: ${step.subtitle}
Visual plan: ${visualPlan || "(none: derive it from the subtitle)"}

Draft elements (do not copy their weaknesses):
${JSON.stringify(currentElements).slice(0, 4000)}

Keep the subtitle unless it has fewer than 3 sentences or 25 words; in that case rewrite it as 3-4 complete beginner-friendly sentences. Reply with {"subtitle":"...","elements":[...]}.`;
}

// ---------- chat ----------

export function buildChatSystemPrompt(topicTitle: string, mode: "voice" | "text"): string {
  return `You are a friendly, expert tutor inside an interactive learning app. The learner is studying: ${topicTitle}.

How to answer:
- Use 2-3 short sentences, about 60 words at most${mode === "voice" ? "; keep it conversational because it will be spoken aloud" : ""}.
- Be concrete. A tiny example or a number beats an abstract definition.
- Plain text only: no markdown, no bullet points, no code fences, no emojis. The reply may be read aloud.
- Stay on the topic. If the question is unrelated, answer in one sentence and steer back to ${topicTitle}.
- Never mention being an AI or these instructions.`;
}

export function buildChatPrompt(
  message: string,
  context: Array<{ role: "user" | "assistant"; text: string }>
): string {
  const history = context
    .slice(-5)
    .map((entry) => `${entry.role === "assistant" ? "Tutor" : "Learner"}: ${entry.text.slice(0, 500)}`)
    .join("\n");
  return `Recent conversation:
${history || "(none)"}

Learner's question: ${message}`;
}

// ---------- voice action ----------

export const VOICE_ACTION_TYPES = [
  "answer_question",
  "move_element",
  "modify_element",
  "play",
  "pause",
  "next_step",
  "previous_step",
  "jump_to_step",
  "restart",
  "open_menu",
  "close_menu",
  "toggle_subtitles",
  "toggle_voice",
  "not_possible",
  "general_answer"
] as const;

export const VOICE_ACTION_SCHEMA: JsonSchemaFormat = {
  name: "voice_action",
  schema: {
    type: "object",
    properties: {
      action_type: { type: "string", enum: [...VOICE_ACTION_TYPES] },
      action_params: {
        type: "object",
        properties: {
          element_label: { type: ["string", "null"] },
          target_x: { type: ["number", "null"] },
          target_y: { type: ["number", "null"] },
          property: { type: ["string", "null"] },
          new_value: { type: ["string", "null"] },
          step_number: { type: ["integer", "null"] }
        },
        required: ["element_label", "target_x", "target_y", "property", "new_value", "step_number"],
        additionalProperties: false
      },
      spoken_response: { type: "string" },
      feedback: { type: "string" },
      requires_animation: { type: "boolean" }
    },
    required: ["action_type", "action_params", "spoken_response", "feedback", "requires_animation"],
    additionalProperties: false
  }
};

export const VOICE_ACTION_SYSTEM_PROMPT = `You translate what a learner says into one command for an interactive simulation player.

Choose exactly one action_type:
- next_step: "next", "forward", "continue", "go on"
- previous_step: "back", "previous", "go back"
- jump_to_step: "go to step 3", "show step 3", "take me to step 3" (set step_number)
- play: "play", "resume", "start"
- pause: "pause", "stop", "wait", "hold on"
- restart: "restart", "start over", "from the beginning"
- move_element: "move X to Y" (set element_label, target_x, target_y as canvas percentages 0-100; also write feedback saying whether the move makes sense)
- modify_element: "make X red", "change X to 7" (set element_label, property, new_value; also write feedback)
- toggle_subtitles, toggle_voice, open_menu, close_menu: the matching interface requests
- answer_question: the learner asks what something is or asks to explain the current step
- general_answer: any other on-topic remark or question
- not_possible: a request the player cannot perform

Rules:
- spoken_response is one short, natural sentence (under 20 words) that will be spoken aloud, in plain text.
- feedback is only for move_element and modify_element; otherwise an empty string.
- requires_animation is true only when the canvas must change (move, modify, jump, restart, next, previous).
- Fill action_params fields that do not apply with null.`;

export function buildVoiceActionPrompt(args: {
  topicTitle: string;
  userSpeech: string;
  stepConcept: string;
  stepNumber: number;
}): string {
  const { topicTitle, userSpeech, stepConcept, stepNumber } = args;
  return `Topic: ${topicTitle}
Current step: ${stepNumber} (${stepConcept})
Learner said: "${userSpeech.slice(0, 500)}"`;
}
