import { Component } from '@angular/core';
import { ThreeScene } from './three-scene/three-scene';

@Component({
  imports: [ThreeScene],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
