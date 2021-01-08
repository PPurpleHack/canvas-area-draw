import { Directive, ElementRef, EventEmitter, Input, NgZone, Output, Renderer2 } from '@angular/core';

import { BasePath } from '../lib/shapes';
import { PathData } from '../lib/models';

@Directive({
  selector: '[canvasAreaDraw]',
  exportAs: 'canvasAreaDraw'
})
export class NgxCanvasAreaDrawTestingDirective {
  @Input('canvasAreaDraw')
  imageUrl: string;
  @Input()
  strokeColor: string;
  @Input()
  fillColor: string;
  @Input()
  handlerStrokeColor: string;
  @Input()
  handlerFillColor: string;
  @Input()
  defaultPaths: PathData[] = [];
  @Input()
  defaultActivePathIndex: number;
  @Input()
  notifyWhileMoving: boolean;
  @Input()
  allowDelete = true;
  @Output()
  activePathChange: EventEmitter<number> = new EventEmitter<number>();
  @Output()
  pathAdded: EventEmitter<void> = new EventEmitter();
  @Output()
  pathDeleted: EventEmitter<number> = new EventEmitter<number>();

  paths: BasePath[] = [];
  height: number;
  width: number;
  isLoading: boolean;
  isDrawing: boolean;

  constructor(
    private  element: ElementRef,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {
  }

  getPathImage(path: BasePath): string {
    return '';
  }

  getImageInPosition(position: number = null): string {
    return '';
  }

  startDrawing(): void {
  }

  addPath(pathData: PathData, notifyChange: boolean = true): void {
  }
}
