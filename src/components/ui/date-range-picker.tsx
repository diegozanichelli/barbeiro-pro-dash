import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { addDays, format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  date: DateRange | undefined;
  onDateChange: (date: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  date,
  onDateChange,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handlePreset = (preset: string) => {
    const today = new Date();
    let newRange: DateRange | undefined;

    switch (preset) {
      case "today":
        newRange = { from: today, to: today };
        break;
      case "yesterday":
        const yesterday = addDays(today, -1);
        newRange = { from: yesterday, to: yesterday };
        break;
      case "thisMonth":
        newRange = { from: startOfMonth(today), to: endOfMonth(today) };
        break;
      case "lastMonth":
        const lastMonth = subMonths(today, 1);
        newRange = { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
        break;
      case "last7Days":
        newRange = { from: addDays(today, -6), to: today };
        break;
    }

    onDateChange(newRange);
    setIsOpen(false);
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "dd/MM/yyyy")} -{" "}
                  {format(date.to, "dd/MM/yyyy")}
                </>
              ) : (
                format(date.from, "dd/MM/yyyy")
              )
            ) : (
              <span>Selecione o período</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            <div className="border-r p-3 space-y-2">
              <div className="text-sm font-medium mb-2">Presets</div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handlePreset("today")}
              >
                Hoje
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handlePreset("yesterday")}
              >
                Ontem
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handlePreset("thisMonth")}
              >
                Este Mês
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handlePreset("lastMonth")}
              >
                Mês Passado
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handlePreset("last7Days")}
              >
                Últimos 7 dias
              </Button>
            </div>
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={onDateChange}
              numberOfMonths={2}
              className={cn("p-3 pointer-events-auto")}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
