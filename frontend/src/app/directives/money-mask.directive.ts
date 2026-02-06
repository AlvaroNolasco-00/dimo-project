import { Directive, ElementRef, HostListener, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';

@Directive({
    selector: '[appMoneyMask]',
    standalone: true,
    providers: [
        CurrencyPipe,
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => MoneyMaskDirective),
            multi: true
        }
    ]
})
export class MoneyMaskDirective implements ControlValueAccessor {
    private el: HTMLInputElement;
    private onChange: (value: number) => void = () => { };
    private onTouched: () => void = () => { };

    constructor(
        private elementRef: ElementRef,
        private currencyPipe: CurrencyPipe
    ) {
        this.el = this.elementRef.nativeElement;
    }

    // ControlValueAccessor methods
    writeValue(value: any): void {
        this.formatView(value);
    }

    registerOnChange(fn: any): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: any): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.el.disabled = isDisabled;
    }

    @HostListener('input')
    onInput() {
        const value = this.el.value;
        // Allow typing decimals: replace comma with dot, remove non-numeric except dot
        let clean = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');

        // Ensure only one dot
        const parts = clean.split('.');
        if (parts.length > 2) {
            clean = parts[0] + '.' + parts.slice(1).join('');
        }

        // Preserve the cursor position logic
        const cursorPosition = this.el.selectionStart;

        // Update the view value with the dollar sign
        this.el.value = clean ? '$ ' + clean : '$ ';

        // Restore cursor position (minimum 2 to skip "$ ")
        if (cursorPosition !== null) {
            const newPos = Math.max(2, cursorPosition);
            setTimeout(() => this.el.setSelectionRange(newPos, newPos), 0);
        }

        // Update the model with numeric value
        const numericValue = parseFloat(clean);
        this.onChange(isNaN(numericValue) ? 0 : numericValue);
    }

    @HostListener('blur')
    onBlur() {
        this.onTouched();
        // Final formal on blur
        const numericValue = parseFloat(this.el.value.replace(/[^0-9.]/g, ''));
        this.formatView(numericValue);
    }

    private formatView(value: any) {
        const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : value;
        if (numericValue !== null && numericValue !== undefined && !isNaN(numericValue)) {
            this.el.value = this.currencyPipe.transform(numericValue, 'USD', 'symbol', '1.2-2') || '';
        } else {
            this.el.value = '$ 0.00';
        }
    }
}
