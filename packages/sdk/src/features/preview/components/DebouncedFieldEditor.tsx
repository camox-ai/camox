import { Input } from "@camox/ui/input";
import { Label } from "@camox/ui/label";
import { Textarea } from "@camox/ui/textarea";
import * as React from "react";

import { useDebouncedField } from "@/hooks/use-debounced-field";

const DebouncedFieldEditor = ({
  label,
  placeholder,
  initialValue,
  onSave,
  disabled,
  rows,
}: {
  label: string;
  placeholder: string;
  initialValue: string;
  onSave: (value: string) => void;
  disabled?: boolean;
  rows?: number;
}) => {
  const { value, setValue, onFocus, onBlur } = useDebouncedField(initialValue, onSave);
  const inputId = React.useId();

  const handleChange = (newValue: string) => {
    if (disabled) return;
    if (rows) newValue = newValue.replace(/\n/g, " ");
    setValue(newValue);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      {rows ? (
        <Textarea
          id={inputId}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className="resize-none"
        />
      ) : (
        <Input
          id={inputId}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </div>
  );
};

export { DebouncedFieldEditor };
