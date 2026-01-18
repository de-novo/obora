"use client";

import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type SeparatorProps,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({
  className,
  ...props
}: GroupProps) => (
  <Group
    className={cn(
      "flex h-full w-full data-[orientation=vertical]:flex-col",
      className
    )}
    {...props}
  />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: Omit<SeparatorProps, "children"> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-px shrink-0 items-center justify-center bg-border after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[''] hover:bg-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full data-[orientation=vertical]:after:inset-x-0 data-[orientation=vertical]:after:-top-1 data-[orientation=vertical]:after:-bottom-1 data-[orientation=vertical]:after:left-auto data-[orientation=vertical]:after:right-auto [&[data-resize-handle-active]]:bg-primary cursor-col-resize data-[orientation=vertical]:cursor-row-resize",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-8 w-3 items-center justify-center rounded-sm border bg-border hover:bg-muted">
        <svg
          className="size-2.5 text-muted-foreground"
          fill="currentColor"
          viewBox="0 0 6 16"
        >
          <circle cx="1" cy="2" r="1" />
          <circle cx="1" cy="8" r="1" />
          <circle cx="1" cy="14" r="1" />
          <circle cx="5" cy="2" r="1" />
          <circle cx="5" cy="8" r="1" />
          <circle cx="5" cy="14" r="1" />
        </svg>
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
