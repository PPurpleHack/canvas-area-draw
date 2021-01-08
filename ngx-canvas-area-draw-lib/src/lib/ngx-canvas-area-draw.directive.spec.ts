import { Component, NO_ERRORS_SCHEMA, Renderer2, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { configureTestSuite } from 'ng-bullet';

import { NgxCanvasAreaDrawDirective } from './ngx-canvas-area-draw.directive';

@Component({
  selector: 'app-mock',
  template: '' +
    '<div #areaDraw="canvasAreaDraw" ' +
    '     [canvasAreaDraw]=""></div>'
})
export class MockComponent {
  @ViewChild('areaDraw')
  areaDraw: NgxCanvasAreaDrawDirective;

  constructor(private renderer: Renderer2) {
  }
}

describe('AppComponent', () => {
  let component: MockComponent;
  let fixture: ComponentFixture<MockComponent>;

  configureTestSuite(() => {
    TestBed.configureTestingModule({
      declarations: [
        MockComponent,
        NgxCanvasAreaDrawDirective
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
