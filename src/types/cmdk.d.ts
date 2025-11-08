declare module "cmdk" {
  import * as React from "react";
  export interface CommandDialogProps extends React.ComponentPropsWithoutRef<"div"> {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    label?: string;
  }
  export const Command: React.FC & {
    Input: React.FC<React.ComponentPropsWithoutRef<"input"> & { onValueChange?: (v: string) => void }>;
    List: React.FC<React.ComponentPropsWithoutRef<"div">>;
    Item: React.FC<React.ComponentPropsWithoutRef<"div"> & { value?: string; onSelect?: (value: string) => void }>;
    Group: React.FC<React.ComponentPropsWithoutRef<"div"> & { heading?: string }>;
    Loading: React.FC<React.ComponentPropsWithoutRef<"div">>;
    Dialog: React.FC<CommandDialogProps>;
  };
}
