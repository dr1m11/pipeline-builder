import { Button, type ButtonProps } from '@/shared/ui/button';
import { Tooltip, type TooltipProps } from '@/shared/ui/tooltip';

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'aria-label'> {
  /** Accessible name of the control, also shown as its tooltip. Required: the button has no text. */
  label: string;
  tooltipSide?: TooltipProps['side'];
}

/** Square icon-only button with a required label and a matching tooltip. */
export function IconButton({
  label,
  tooltipSide = 'bottom',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <Button {...props} variant={variant} size="icon" aria-label={label} />
    </Tooltip>
  );
}
