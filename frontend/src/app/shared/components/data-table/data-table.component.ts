import { Component } from '@angular/core';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [],
  template: `
    <div class="table-container">
      <div class="table-responsive">
        <table class="data-table">
          <ng-content></ng-content>
        </table>
      </div>
    </div>
  `,
  styles: [`:host { display: block; }`],
})
export class DataTableComponent {}
