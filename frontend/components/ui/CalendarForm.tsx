"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker , DropdownProps} from "react-day-picker"
import { format } from "date-fns"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "@radix-ui/react-icons"
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from "./form"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Control } from "react-hook-form"

import { FieldValues } from "react-hook-form"

export type CalendarProps<T extends FieldValues> = React.ComponentProps<typeof DayPicker> & {
  control: Control<T>
  name: string
  label: string
  placeholder?: string
}

function CalendarForm({
  className,
  classNames,
  showOutsideDays = true,
  control,
  name,
  label,
  placeholder,
  locale,
  ...props
}: CalendarProps<any>) {
  return (

    <FormField
          control={control}
          name={name}
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{label}</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-[240px] pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP")
                      ) : (
                        <span>{placeholder}</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DayPicker
                    captionLayout="dropdown"
                    fromDate={new Date("1900-01-01")}
                    toDate={new Date()}
                    locale={locale}
                    showOutsideDays={showOutsideDays}
                    className={cn("p-5", className)}
                    classNames={{
                      months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                      month: "space-y-4",
                      caption: "flex justify-center pt-1 relative items-center",
                      caption_label: "sr-only font-medium",
                      caption_dropdowns: "flex justify-center gap-1",
                      nav: "space-x-1 flex items-center",
                      nav_button: cn(
                        buttonVariants({ variant: "outline" }),
                        "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                      ),
                      nav_button_previous: "absolute left-1",
                      nav_button_next: "absolute right-1",
                      table: "w-full border-collapse space-y-1",
                      head_row: "flex",
                      head_cell:
                        "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                      row: "flex w-full mt-2",
                      cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                      day: cn(
                        buttonVariants({ variant: "ghost" }),
                        "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
                      ),
                      day_range_end: "day-range-end",
                      day_selected:
                        "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                      day_today: "bg-accent text-accent-foreground",
                      day_outside:
                        "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                      day_disabled: "text-muted-foreground opacity-50",
                      day_range_middle:
                        "aria-selected:bg-accent aria-selected:text-accent-foreground",
                      day_hidden: "invisible",
                      ...classNames,
                    }}
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) =>
                      date > new Date() || date < new Date("1900-01-01")
                    }
                    components={{
                        Dropdown: ({ value, onChange, children }: DropdownProps) => {
                            const options = React.Children.toArray(children) as React.ReactElement<React.HTMLProps<HTMLOptionElement>>[]
                            const selected = options.find((child) => child.props.value === value)
                            const handleChange = (value: string) => {
                              const changeEvent = {
                                target: { value },
                              } as React.ChangeEvent<HTMLSelectElement>
                              onChange?.(changeEvent)
                            }
                            return (
                              <Select
                                value={value?.toString()}
                                onValueChange={(value) => {
                                  handleChange(value)
                                }}
                              >
                                <SelectTrigger className="pr-1.5 focus:ring-0">
                                  <SelectValue>{selected?.props?.children}</SelectValue>
                                </SelectTrigger>
                                <SelectContent position="popper">
                                  <ScrollArea className="h-80">
                                    {options.map((option, id: number) => (
                                      <SelectItem key={`${option.props.value}-${id}`} value={option.props.value?.toString() ?? ""}>
                                        {option.props.children}
                                      </SelectItem>
                                    ))}
                                  </ScrollArea>
                                </SelectContent>
                              </Select>
                            )
                          },
                          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                          IconRight: () => <ChevronRight className="h-4 w-4" />,
                    }}
                    {...field}
                    {...props}
                  />
                </PopoverContent>
              </Popover>
              
              <FormMessage />
            </FormItem>
          )}
        />
    
  )
}
CalendarForm.displayName = "Calendar"

export { CalendarForm }