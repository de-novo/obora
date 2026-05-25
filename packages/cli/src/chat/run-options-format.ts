import type { ChatRunOptions } from "./types.js";

const optionParts = (options: ChatRunOptions | undefined): ReadonlyArray<string> => [
  ...(options?.provider ? [`provider ${options.provider}`] : []),
  ...(options?.model ? [`model ${options.model}`] : []),
  ...(options?.config ? [`config ${options.config}`] : []),
  ...(options?.agents ? [`agents ${options.agents}`] : []),
  ...(options?.policy ? [`policy ${options.policy}`] : []),
  ...(options?.timeout === undefined ? [] : [`timeout ${options.timeout}ms`]),
];

export const formatChatRunOptions = (
  options: ChatRunOptions | undefined
): string | undefined => {
  const parts = optionParts(options);
  return parts.length > 0 ? parts.join(" · ") : undefined;
};

export const formatChatRunOptionsOrDefault = (
  options: ChatRunOptions | undefined
): string => formatChatRunOptions(options) ?? "default";
