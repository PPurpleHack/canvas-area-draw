import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  Output,
  Renderer2
} from '@angular/core';

import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

import { getShape, BasePath, GenericPath, Pencil } from './shapes';
import { MousePosition, PathData } from './models';

// toDo: fox, 4/10/19 Rename to cadWorkspace
@Directive({
  selector: '[canvasAreaDraw]',
  exportAs: 'canvasAreaDraw'
})
export class NgxCanvasAreaDrawDirective implements AfterViewInit, OnDestroy {
  static DEFAULT_STROKE_COLOR = 'rgba(255, 255, 255, 0.7)';
  static DEFAULT_FILL_COLOR = 'rgba(255, 255, 255, 0.2)';
  static DEFAULT_HANDLER_STROKE_COLOR = 'rgba(255, 255, 255, 1)';
  static DEFAULT_HANDLER_FILL_COLOR = 'rgba(255, 255, 255, 1)';

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

  private _pencil: Pencil;
  private _activePathPosition: number;
  private _baseCanvas: HTMLCanvasElement;
  private _baseImage: HTMLImageElement;
  private _pencilSubscription: Subscription;
  private _pathsSubscription: Subscription[][];

  constructor(
    private  element: ElementRef,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {
    this._pathsSubscription = [];
    this._resetIndicators();
    this.renderer.setStyle(
      this.element.nativeElement,
      'position',
      'relative'
    );
  }

  private _imageUrl: string;

  get imageUrl() {
    return this._imageUrl;
  }

  // toDo: fox, 4/10/19 Receive also an image file
  @Input('canvasAreaDraw')
  set imageUrl(url: string) {
    if (!this.isLoading) {
      this._resetIndicators();
      this._removeAllMouseListeners();
      this._removeAllPaths();

      this._imageUrl = url;

      if (url) {
        this.ngZone.runOutsideAngular(() => this._paint());
      } else {
        this._removeBaseImage();
        this.isLoading = false;
      }
    } else if (url) {
      this._imageUrl = url;
    }
  }

  private _strokeColor: string = NgxCanvasAreaDrawDirective.DEFAULT_STROKE_COLOR;

  get strokeColor() {
    return this._strokeColor;
  }

  @Input('strokeColor')
  set strokeColor(color: string) {
    if (color && this._strokeColor) {
      this._applyStrokeColor(color);
    }
    this._strokeColor = color || NgxCanvasAreaDrawDirective.DEFAULT_STROKE_COLOR;
  }

  private _fillColor: string = NgxCanvasAreaDrawDirective.DEFAULT_FILL_COLOR;

  get fillColor() {
    return this._fillColor;
  }

  @Input('fillColor')
  set fillColor(color: string) {
    if (color && this._fillColor) {
      this._applyFillColor(color);
    }
    this._fillColor = color || NgxCanvasAreaDrawDirective.DEFAULT_FILL_COLOR;
  }

  private _handlerStrokeColor: string = NgxCanvasAreaDrawDirective.DEFAULT_HANDLER_STROKE_COLOR;

  get handlerStrokeColor() {
    return this._handlerStrokeColor;
  }

  @Input('handlerStrokeColor')
  set handlerStrokeColor(color: string) {
    if (color && this._handlerStrokeColor) {
      this.applyHandlerStrokeColor(color);
    }
    this._handlerStrokeColor = color || NgxCanvasAreaDrawDirective.DEFAULT_HANDLER_STROKE_COLOR;
  }

  private _handlerFillColor: string = NgxCanvasAreaDrawDirective.DEFAULT_HANDLER_FILL_COLOR;

  get handlerFillColor() {
    return this._handlerFillColor;
  }

  @Input('handlerFillColor')
  set handlerFillColor(color: string) {
    if (color && this._handlerFillColor) {
      this._applyHandlerFillColor(color);
    }
    this._handlerFillColor = color || NgxCanvasAreaDrawDirective.DEFAULT_HANDLER_FILL_COLOR;
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => this._paint());
  }

  // toDo: fox, 4/10/19 Isolate this method from the directive, it should receive:
  // the points
  // base image
  // dimensions: width & height
  getPathImage(path: BasePath): string {
    const canvas = this.renderer.createElement('canvas');
    const context = canvas.getContext('2d');

    const pathBoundaries = path.getBoundaries();
    canvas.width = pathBoundaries.maxX - pathBoundaries.minX;
    canvas.height = pathBoundaries.maxY - pathBoundaries.minY;

    path.points
      .filter((point: number[]) => point && point.length > 0)
      .forEach((point: number[]) => {
        point = path.getPointInPx(point);
        context.lineTo(
          point[0] - pathBoundaries.minX,
          point[1] - pathBoundaries.minY
        );
      });

    context.closePath();
    context.clip();
    context.drawImage(
      this._baseImage,
      -pathBoundaries.minX,
      -pathBoundaries.minY,
      this.width,
      this.height
    );

    // toDo: fox, 4/10/19 convert to JPEG to save size
    return canvas.toDataURL(
      'image/png',
      0.96
    )
  }

  // toDo: fox, 4/10/19 Implement a method to get the image file
  getImageInPosition(position: number = null): string {
    if (typeof (position) !== 'number') {
      position = this._activePathPosition;
    }
    if (typeof (position) === 'number' && this.paths.length > position) {
      const path = this.paths[position];
      return this.getPathImage(path);
    }
    return null;
  }

  startDrawing(): void {
    if (!this.isLoading && !this.isDrawing) {
      this.isDrawing = true;
      this._setActivePathPosition(null);
      this._setUpPencil();

      this._pencilSubscription = this._pencil.completed
        .pipe(take(1))
        .subscribe(() => this._finishDrawing());

      this._MousemoveListener = this.renderer.listen(
        this._baseCanvas,
        'mousemove',
        this._onMovePoint.bind(this)
      );
    }
  }

  addPath(pathData: PathData, notifyChange: boolean = true): void {
    const newPath = getShape(
      pathData.name,
      [
        this.renderer,
        this.element,
        this.strokeColor,
        this.fillColor,
        this.handlerFillColor,
        this.handlerStrokeColor,
        pathData.points,
        pathData.forcedAspectRatio,
        pathData.keepInsideContainer
      ]
    );

    this._setStyle(
      newPath.canvas,
      (this.paths.length + 2).toString()
    );
    this.renderer.setStyle(
      this._baseCanvas,
      'z-index',
      this.paths.length + 3
    );

    const movePointSubscription = newPath.movingPoint
      .subscribe(() => {
        this._MousemoveListener = this.renderer.listen(
          this._baseCanvas,
          'mousemove',
          this._onMovePoint.bind(this)
        );
      });

    const movePathSubscription = newPath.movingPath
      .subscribe(() => {
        this._MousemoveListener = this.renderer.listen(
          this._baseCanvas,
          'mousemove',
          this._onMovePath.bind(this)
        );
      });

    const resizePathSubscription = newPath.resizingPath
      .subscribe(() => {
        this._MousemoveListener = this.renderer.listen(
          this._baseCanvas,
          'mousemove',
          this._onResizePath.bind(this)
        );
      });

    this._pathsSubscription.push([movePointSubscription, movePathSubscription, resizePathSubscription]);

    this.paths.push(newPath);
    if (notifyChange) {
      this.paths
        .filter((path: BasePath) => path.isActive)
        .forEach((path: BasePath) => {
          path.isActive = false;
        });
      this.pathAdded.emit();
      this._setActivePathPosition(this.paths.length - 1);
    }
  }

  resetPaths(){
    this._removeAllPaths();
  }

  ngOnDestroy() {
    this._removeAllListeners();
    this._deleteAllPathsSubscriptions();
    if (this._pencilSubscription) {
      this._pencilSubscription.unsubscribe();
    }
  }

  private _updateGeometry() {
    this.height = this._baseImage.height;
    this.width = this._baseImage.width;
  }

  @HostListener('window:resize')
  private scaleContent() {
    this._updateGeometry();

    if (this._baseCanvas) {
      this._setGeometry(this._baseCanvas);
    }

    if (this._pencil) {
      this._setGeometry(this._pencil.canvas);
      this._pencil.draw();
    }

    this.paths.forEach((path: BasePath) => {
      this._setGeometry(path.canvas);
      path.draw();
    });
  }

  private _setUpPencil() {
    this.renderer.setStyle(
      this._pencil.canvas,
      'display',
      'block'
    );
    this.renderer.setStyle(
      this._pencil.canvas,
      'z-index',
      this.paths.length + 2
    );
    this.renderer.setStyle(
      this._baseCanvas,
      'z-index',
      this.paths.length + 3
    );
    this.renderer.setStyle(
      this._baseCanvas,
      'cursor',
      'copy'
    );
  }

  private _setActivePathPosition(position: number, deactivateCurrent = true): void {
    if (deactivateCurrent && typeof (this._activePathPosition) === 'number') {
      this.paths[this._activePathPosition].isActive = false;
    }
    if (typeof (position) === 'number') {
      this.paths[position].isActive = true;
    } else if (this._activePathPosition === position) {
      return;
    }
    this._activePathPosition = position;
    this.activePathChange.emit(position);
  }

  private applyHandlerStrokeColor(color: string) {
    this.paths.forEach((path: BasePath) => {
      path.setColors({
        handlerStrokeColor: color
      });
    });

    if (this._pencil) {
      this._pencil.setColors({
        handlerStrokeColor: color
      });
    }
  }

  private _applyHandlerFillColor(color: string) {
    this.paths.forEach((path: BasePath) => {
      path.setColors({
        handlerFillColor: color
      });
    });

    if (this._pencil) {
      this._pencil.setColors({
        handlerFillColor: color
      });
    }
  }

  private _applyFillColor(color: string) {
    this.paths.forEach((path: BasePath) => {
      path.setColors({
        fillColor: color
      });
    });
  }

  private _applyStrokeColor(color: string) {
    this.paths.forEach((path: BasePath) => {
      path.setColors({
        strokeColor: color
      });
    });

    if (this._pencil) {
      this._pencil.setColors({
        strokeColor: color
      });
    }
  }

  private _removeBaseImage() {
    if (this._baseImage) {
      this._ImageLoadListener();
      this._ImageErrorListener();
      this.renderer.removeChild(
        this.element.nativeElement,
        this._baseImage
      );
      this._baseImage = null;
    }
  }

  private _removeAllPaths() {
    this._deleteAllPathsSubscriptions();
    this.paths.forEach((path: BasePath) => {
      this.renderer.removeChild(
        this.element.nativeElement,
        path.canvas
      );
    });
    this.paths = [];
  }

  private _removeBaseCanvas() {
    if (this._baseCanvas) {
      this._removeAllMouseListeners();
      this.renderer.removeChild(
        this.element.nativeElement,
        this._baseCanvas
      );
      this._baseCanvas = null;
    }
  }

  private _createNewBaseCanvas() {
    this._removeBaseCanvas();
    this._baseCanvas = this.renderer.createElement('canvas');
    this.renderer.appendChild(this.element.nativeElement, this._baseCanvas);

    this._MouseLeaveListener = this.renderer.listen(
      this._baseCanvas,
      'mouseleave',
      this._onMouseleave.bind(this)
    );
    this._MousedownListener = this.renderer.listen(
      this._baseCanvas,
      'mousedown',
      this._onMousedown.bind(this)
    );
    this._MouseupListener = this.renderer.listen(
      this._baseCanvas,
      'mouseup',
      this._onMouseup.bind(this)
    );
    this._ContextmenuListener = this.renderer.listen(
      this._baseCanvas,
      'contextmenu',
      this._onContextmenu.bind(this)
    );
  }

  private _removePencil() {
    if (this._pencil) {
      this.renderer.removeChild(
        this.element.nativeElement,
        this._pencil.canvas
      );
      this._pencil = null;
    }
  }

  private _resetIndicators() {
    this.isLoading = true;
    this.isDrawing = false;
    this.height = null;
    this.width = null;
    this._activePathPosition = null;
  }

  private _createBaseImage() {
    this._baseImage = this.renderer.createElement('img');
    this.renderer.setAttribute(
      this._baseImage,
      'crossOrigin',
      'Anonymous'
    );
    this._setStyle(this._baseImage, '1');
    this._listenImageLoad();
    this._listenImageImageError();
    this.renderer.appendChild(this.element.nativeElement, this._baseImage);
  }

  private _listenImageImageError() {
    this._ImageErrorListener = this.renderer.listen(this._baseImage, 'error', () => {
      this.isLoading = false;
    });
  }

  private _listenImageLoad() {
    this._ImageLoadListener = this.renderer.listen(this._baseImage, 'load', () => {
      this._updateGeometry();
      this._createNewPencil();
      this._setStyle(this._baseCanvas, '3');
      this._addDefaultPaths();
      this.isLoading = false;
    });
  }

  private _createNewPencil() {
    this._removePencil();
    this._pencil = new Pencil(
      this.renderer,
      this.element,
      null,
      this.strokeColor,
      this.handlerFillColor,
      this.handlerStrokeColor
    );
    this._setStyle(this._pencil.canvas, '0');
  }

  private _addDefaultPaths() {
    if (this.defaultPaths.length > 0) {
      this.defaultPaths.forEach((pathData: PathData, index: number) => {
        this.addPath(pathData, false);
        if (this.defaultActivePathIndex === index) {
          this._setActivePathPosition(index);
        }
      });
      this.defaultPaths = [];
    }
  }

  private _paint(): void {
    this._createNewBaseCanvas();
    if (!this._baseImage) {
      this._createBaseImage();
    }
    if (this.imageUrl) {
      this.renderer.setAttribute(
        this._baseImage,
        'src',
        this.imageUrl
      );
    } else {
      this.isLoading = false;
    }
  }

  private _finishDrawing(): void {
    if (this.isDrawing) {
      this._MousemoveListener();
      this.isDrawing = false;
      const points = this._pencil.points.filter(x => x);
      this.renderer.setStyle(
        this._baseCanvas,
        'cursor',
        'default'
      );
      this._pencil.reset();
      if (points) {
        this.addPath({
          name: GenericPath.NAME,
          points
        });
      }
    }
  }

  private _checkPathClicked(mousePos: MousePosition) {
    this.paths
      .filter((path: BasePath) => path.context.isPointInPath(mousePos.x, mousePos.y))
      .slice(-1)
      .map((path: BasePath) => this.paths.indexOf(path))
      .forEach((index: number) => this._setActivePathPosition(index));

  }

  private _onMouseleave(): boolean {
    this._setActivePathPosition(null);
    if (!this.isDrawing) {
      this._MousemoveListener();
      this.renderer.setStyle(
        this._baseCanvas,
        'cursor',
        'default'
      );
    }
    return false;
  }

  private _onMousedown(event: MouseEvent): boolean {
    event.preventDefault();
    if (event.button === 0) {
      const mousePos = this._getMousePos(event);
      if (!this.isDrawing) {
        if (this.paths.length > 0) {
          this._checkPathClicked(mousePos);

          if (typeof (this._activePathPosition) === 'number' && this.paths.length > this._activePathPosition) {
            this.paths[this._activePathPosition].onMousedown(event, mousePos);
          }
        }
      } else {
        this.renderer.setStyle(
          this._baseCanvas,
          'cursor',
          'move'
        );
      }
    }
    return false;
  }

  private _onMouseup(event: MouseEvent): boolean {
    if (event.button < 2) {
      const mousePos = this._getMousePos(event);
      if (this.isDrawing) {
        this.renderer.setStyle(
          this._baseCanvas,
          'cursor',
          'copy'
        );
        this._pencil.onMouseup(event, mousePos);
      } else {
        this.renderer.setStyle(
          this._baseCanvas,
          'cursor',
          'default'
        );
        this._MousemoveListener();
        if (typeof (this._activePathPosition) === 'number' && this.paths.length > this._activePathPosition) {
          const action = this.paths[this._activePathPosition].onMouseup(event, mousePos, this.allowDelete);
          if (action === 'delete path') {
            this._deletePath();
          } else if (action) {
            this.activePathChange.emit(this._activePathPosition);
          }
        }
      }
    }
    return false;
  }

  private _deletePath() {
    this.renderer.removeChild(
      this.element.nativeElement,
      this.paths[this._activePathPosition].canvas
    );
    this.paths.splice(
      this._activePathPosition,
      1
    );
    this._deletePathSubscription(
      this._activePathPosition
    );
    this.pathDeleted.emit(
      this._activePathPosition
    );

    if (this.paths.length > 0) {
      this._setActivePathPosition(this.paths.length - 1, false);
    } else {
      this._setActivePathPosition(null, false);
    }
  }

  private _onContextmenu(event: MouseEvent): boolean {
    event.preventDefault();
    return false;
  }

  private _onMovePath(event: MouseEvent): boolean {
    if (typeof (this._activePathPosition) === 'number') {
      const mousePos = this._getMousePos(event);
      if (this.notifyWhileMoving) {
        this.activePathChange.emit(this._activePathPosition);
      }
      this.renderer.setStyle(
        this._baseCanvas,
        'cursor',
        'move'
      );
      this.paths[this._activePathPosition].onMovePath(event, mousePos);
    }
    return false;
  }

  private _onMovePoint(event: MouseEvent): boolean {
    const mousePos = this._getMousePos(event);
    if (this.isDrawing) {
      this._pencil.onMovePoint(event, mousePos);
    } else if (typeof (this._activePathPosition) === 'number') {
      if (this.notifyWhileMoving) {
        this.activePathChange.emit(this._activePathPosition);
      }
      this.renderer.setStyle(
        this._baseCanvas,
        'cursor',
        'move'
      );
      this.paths[this._activePathPosition].onMovePoint(event, mousePos);
    }
    return false;
  };

  private _onResizePath(event: MouseEvent): boolean {
    if (typeof (this._activePathPosition) === 'number') {
      const mousePos = this._getMousePos(event);
      if (this.notifyWhileMoving) {
        this.activePathChange.emit(this._activePathPosition);
      }
      this.renderer.setStyle(
        this._baseCanvas,
        'cursor',
        'ne-resize'
      );
      this.paths[this._activePathPosition].onResizePath(event, mousePos);
    }
    return false;
  }

  private _getMousePos(event: MouseEvent): MousePosition {
    const rect = this._baseCanvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  private _setStyle(element: any, zIndex: string): void {
    this.renderer.setStyle(element, 'position', 'absolute');
    this.renderer.setStyle(element, 'top', '0');
    this.renderer.setStyle(element, 'left', '0');
    this.renderer.setStyle(element, 'z-index', zIndex);
    if (this.height && this.width) {
      this._setGeometry(element);
    } else {
      this.renderer.setStyle(element, 'height', 'auto');
      this.renderer.setStyle(element, 'width', '100%');
    }
  }

  private _setGeometry(element: any) {
    this.renderer.setAttribute(
      element,
      'height',
      `${this.height}`
    );
    this.renderer.setAttribute(
      element,
      'width',
      `${this.width}`
    );
  }

  private _deleteAllPathsSubscriptions(): void {
    for (const subscriptions of this._pathsSubscription) {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    }
    this._pathsSubscription = [];
  }

  private _deletePathSubscription(pos: number): void {
    for (const subscription of this._pathsSubscription[pos]) {
      subscription.unsubscribe();
    }
    this._pathsSubscription.splice(pos, 1);
  }

  private _removeAllListeners() {
    this._removeAllMouseListeners();
    this._ImageLoadListener();
    this._ImageErrorListener();
  }

  private _removeAllMouseListeners() {
    this._MousedownListener();
    this._MouseupListener();
    this._MouseLeaveListener();
    this._MousemoveListener();
    this._ContextmenuListener();
  }

  private _MousedownListener(): void {
  }

  private _MouseupListener(): void {
  }

  private _MouseLeaveListener(): void {
  }

  private _MousemoveListener(): void {
  }

  private _ContextmenuListener(): void {
  }

  private _ImageLoadListener(): void {
  }

  private _ImageErrorListener(): void {
  }
}
