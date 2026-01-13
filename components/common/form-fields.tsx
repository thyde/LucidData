/**
 * Reusable Form Field Components
 *
 * Generic form field components that wrap react-hook-form with shadcn/ui.
 * Reduces boilerplate in form-heavy components.
 */

import { ReactNode } from 'react';
import { Control, FieldPath, FieldValues } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * Base form field props
 */
interface BaseFormFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label?: string;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Text input field
 */
export function FormTextField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled,
  ...inputProps
}: BaseFormFieldProps<TFieldValues> & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Input
              placeholder={placeholder}
              disabled={disabled}
              {...inputProps}
              {...field}
              value={field.value || ''}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Textarea field
 */
export function FormTextAreaField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled,
  rows = 3,
  className = '',
  ...textareaProps
}: BaseFormFieldProps<TFieldValues> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Textarea
              placeholder={placeholder}
              disabled={disabled}
              rows={rows}
              className={className}
              {...textareaProps}
              {...field}
              value={field.value || ''}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Select field
 */
interface SelectOption {
  value: string;
  label: string;
}

export function FormSelectField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder = 'Select an option',
  disabled,
  options,
  ...selectProps
}: BaseFormFieldProps<TFieldValues> &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    options: SelectOption[];
  }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <select
              {...field}
              {...selectProps}
              disabled={disabled}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {placeholder && <option value="">{placeholder}</option>}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Date/Time input field
 */
export function FormDateField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  disabled,
  type = 'datetime-local',
  ...inputProps
}: BaseFormFieldProps<TFieldValues> &
  React.InputHTMLAttributes<HTMLInputElement> & {
    type?: 'date' | 'datetime-local' | 'time';
  }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              {...inputProps}
              {...field}
              value={
                field.value instanceof Date
                  ? field.value.toISOString().slice(0, type === 'date' ? 10 : 16)
                  : field.value || ''
              }
              onChange={(e) => field.onChange(e.target.value || undefined)}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Tags input field (comma-separated)
 */
export function FormTagsField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder = 'Enter tags (comma-separated)',
  disabled,
}: BaseFormFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Input
              placeholder={placeholder}
              disabled={disabled}
              value={Array.isArray(field.value) ? field.value.join(', ') : ''}
              onChange={(e) => {
                const tags = e.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter((tag) => tag.length > 0);
                field.onChange(tags);
              }}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Custom field with render prop
 *
 * For fields that need custom rendering logic.
 */
export function FormCustomField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  render,
}: BaseFormFieldProps<TFieldValues> & {
  render: (field: any) => ReactNode;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>{render(field)}</FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
