import {
  Component, ElementRef, ViewChild, input, output,
  OnChanges, AfterViewInit, ChangeDetectionStrategy, effect
} from '@angular/core';

@Component({
  selector: 'app-mask-painter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #canvas
      class="mask-canvas"
      [style.cursor]="'crosshair'"
      (mousedown)="startDraw($event)"
      (mousemove)="draw($event)"
      (mouseup)="stopDraw()"
      (mouseleave)="stopDraw()"
      (touchstart)="onTouchStart($event)"
      (touchmove)="onTouchMove($event)"
      (touchend)="stopDraw()"
    ></canvas>
  `,
  styles: [`
    :host { position: absolute; inset: 0; display: block; }
    .mask-canvas { width: 100%; height: 100%; display: block; mix-blend-mode: screen; opacity: 0.75; }
  `]
})
export class MaskPainterComponent implements AfterViewInit, OnChanges {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly brushSize = input<number>(30);
  readonly imageWidth = input<number>(0);
  readonly imageHeight = input<number>(0);
  readonly maskChange = output<Blob>();
  readonly hasMask = output<boolean>();

  private ctx!: CanvasRenderingContext2D;
  private painting = false;
  private hasStrokes = false;

  ngAfterViewInit(): void {
    this.initCanvas();
  }

  ngOnChanges(): void {
    if (this.ctx) this.initCanvas();
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const w = this.imageWidth();
    const h = this.imageHeight();
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, w, h);
    this.hasStrokes = false;
    this.hasMask.emit(false);
  }

  clearMask(): void {
    if (!this.ctx) return;
    const { width, height } = this.canvasRef.nativeElement;
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, width, height);
    this.hasStrokes = false;
    this.hasMask.emit(false);
  }

  startDraw(e: MouseEvent): void {
    this.painting = true;
    this.drawAt(e);
  }

  draw(e: MouseEvent): void {
    if (!this.painting) return;
    this.drawAt(e);
  }

  stopDraw(): void {
    if (this.painting && this.hasStrokes) this.emitMask();
    this.painting = false;
  }

  onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.painting = true;
    this.drawAt(e.touches[0]);
  }

  onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.painting) return;
    this.drawAt(e.touches[0]);
  }

  private drawAt(e: MouseEvent | Touch): void {
    if (!this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const r = (this.brushSize() / 2) * scaleX;

    this.ctx.fillStyle = 'white';
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();

    this.hasStrokes = true;
    this.hasMask.emit(true);
  }

  private emitMask(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.toBlob(blob => {
      if (blob) this.maskChange.emit(blob);
    }, 'image/png');
  }
}
