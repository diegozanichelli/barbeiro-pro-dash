import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  quickValues?: number[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function formatCentsToBRL(cents: number): string {
  if (cents === 0) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function valueToCents(reais: number): number {
  return Math.round(reais * 100);
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, quickValues, placeholder = "0,00", className, disabled }, ref) => {
    const [cents, setCents] = useState(() => valueToCents(value));
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync external value changes
    useEffect(() => {
      setCents(valueToCents(value));
    }, [value]);

    const updateValue = useCallback((newCents: number) => {
      setCents(newCents);
      onChange(newCents / 100);
    }, [onChange]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow tab, arrow keys, etc.
      if (e.key === "Tab" || e.key === "Escape" || e.key === "Enter") return;

      e.preventDefault();

      if (e.key === "Backspace" || e.key === "Delete") {
        updateValue(Math.floor(cents / 10));
        return;
      }

      // Only allow digits
      if (/^\d$/.test(e.key)) {
        const newCents = cents * 10 + parseInt(e.key);
        // Cap at 999999.99 (99999999 cents)
        if (newCents <= 99999999) {
          updateValue(newCents);
        }
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      // Auto-select all content on focus
      setTimeout(() => e.target.select(), 0);
    };

    const handleQuickValue = (val: number) => {
      updateValue(valueToCents(val));
      // Focus back to input after chip tap
      inputRef.current?.focus();
    };

    const displayValue = formatCentsToBRL(cents);

    return (
      <div className="space-y-2">
        {/* Quick Price Chips */}
        {quickValues && quickValues.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {quickValues.map((qv) => (
              <Button
                key={qv}
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn(
                  "shrink-0 min-h-[44px] px-4 text-sm font-medium transition-colors",
                  cents === valueToCents(qv) && "border-primary bg-primary/10 text-primary"
                )}
                onClick={() => handleQuickValue(qv)}
              >
                R$ {qv}
              </Button>
            ))}
          </div>
        )}

        {/* Currency Input */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
            R$
          </span>
          <Input
            ref={(node) => {
              (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={displayValue}
            placeholder={placeholder}
            disabled={disabled}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onChange={() => {}} // Controlled via onKeyDown
            className={cn(
              "pl-9 text-right font-bold h-12 text-base",
              className
            )}
          />
        </div>
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
