import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SelectOption {
  id: string;
  name: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (id: string, name: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  onSearchChange?: (q: string) => void;
  className?: string;
  emptyMessage?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  disabled = false,
  isLoading = false,
  onSearchChange,
  className,
  emptyMessage = "لا توجد نتائج",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = value ? options.find(o => o.id === value)?.name ?? value : null;

  const filtered = onSearchChange
    ? options
    : options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  function handleSearch(q: string) {
    setQuery(q);
    onSearchChange?.(q);
  }

  function handleSelect(opt: SelectOption) {
    onChange(opt.id, opt.name);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal text-right",
            !selectedLabel && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown size={14} className="mr-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="pr-8 h-8 text-sm border-0 focus-visible:ring-0 shadow-none"
            />
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">جارٍ التحميل...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {onSearchChange && query.length < 2
                ? "اكتب حرفين على الأقل للبحث"
                : emptyMessage}
            </div>
          ) : (
            filtered.map(opt => (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-accent transition-colors"
              >
                <Check
                  size={13}
                  className={cn("shrink-0", value === opt.id ? "opacity-100" : "opacity-0")}
                />
                <span className="flex-1 truncate">{opt.name}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
