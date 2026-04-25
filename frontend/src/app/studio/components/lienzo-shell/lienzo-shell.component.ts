import {
  Component, ViewChild, ChangeDetectionStrategy, AfterViewInit,
  OnDestroy, inject,
} from '@angular/core';
import { LienzoToolbarComponent } from '../lienzo-toolbar/lienzo-toolbar.component';
import { LienzoCanvasComponent } from '../lienzo-canvas/lienzo-canvas.component';
import { LienzoPropsComponent } from '../lienzo-props/lienzo-props.component';
import { LienzoStateService } from '../../services/lienzo-state.service';

@Component({
  selector: 'app-lienzo-shell',
  imports: [LienzoToolbarComponent, LienzoCanvasComponent, LienzoPropsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lienzo-shell">
      <app-lienzo-toolbar />

      <div class="lienzo-body">
        <app-lienzo-canvas />
        <app-lienzo-props />
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .lienzo-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: var(--bg-color);
    }

    .lienzo-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }
  `],
})
export class LienzoShellComponent implements AfterViewInit, OnDestroy {
  @ViewChild(LienzoCanvasComponent) canvas?: LienzoCanvasComponent;
  @ViewChild(LienzoToolbarComponent) toolbar?: LienzoToolbarComponent;

  private state = inject(LienzoStateService);

  ngAfterViewInit(): void {
    if (this.toolbar && this.canvas) {
      this.toolbar.fitToView.set(() => this.canvas!.fitToView());
    }
  }

  ngOnDestroy(): void {
    this.state.reset();
  }
}
