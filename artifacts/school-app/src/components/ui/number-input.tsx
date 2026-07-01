import { forwardRef, useEffect, useState } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value?: string | number;
  onChange?: (raw: string) => void;
  decimals?: number;
}

function formatWithCommas(raw: string, decimals = 0): string {
  if (raw === "" || raw === undefined) return "";
  const [intPart, decPart] = raw.split(".");
  const formatted = Number(intPart || 0).toLocaleString("en-US");
  if (decimals > 0 && decPart !== undefined) return `${formatted}.${decPart.slice(0, decimals)}`;
  return formatted;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, className, decimals = 0, placeholder, ...props }, ref) => {
    const rawStr = value !== undefined && value !== null ? String(value) : "";
    const [display, setDisplay] = useState(() => formatWithCommas(rawStr, decimals));

    useEffect(() => {
      setDisplay(formatWithCommas(rawStr, decimals));
    }, [rawStr, decimals]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const typed = e.target.value;
      const raw = typed.replace(/,/g, "");
      if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
        setDisplay(formatWithCommas(raw, decimals));
        onChange?.(raw);
      }
    }

    function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
      e.target.select();
      props.onFocus?.(e);
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={cn("text-left tabular-nums", className)}
        dir="ltr"
      />
    );
  }
);
NumberInput.displayName = "NumberInput";
