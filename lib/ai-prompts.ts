// AI Prompts — copied from fringue-web/lib/ai-prompts.ts
// Enterprise only uses tryOn

export const AI_PROMPTS = {
  tryOn: `Virtual try-on: Take the person from the FIRST image and dress them with ONLY the provided clothing pieces provided in the OTHER images - do NOT add any extra items and remove items when necessary. Keep the person's face, body pose, and proportions exactly the same. The clothes should fit naturally on their body. Maintain realistic lighting and shadows. Keep the background from the original photo.
  DONT'S:
  - Do not add any extra items
  - Do not change the person's face, body pose, and proportions
  - Do not add any clothing that is not shown in the provided clothing images
  DO'S:
  - Replace the person's clothes with the provided ones
  - Remove items, gloves, socks, shoes, etc when necessary
  - The clothes should fit naturally on their body
  - Keep the background from the original photo
  `,
};
