import React from "react";
import type { RodModuleProps } from "@rodverse/module-sdk";
import SandboxApp from "./SandboxApp";
/** Browser diagnostic also lets host reject a second React before mounting. */
export const reactIdentity = {
  version: React.version,
  useState: React.useState,
};
export default function SandboxModule({ context }: RodModuleProps) {
  return (
    <SandboxApp workspaceId={context.workspace.id} embedded context={context} />
  );
}
