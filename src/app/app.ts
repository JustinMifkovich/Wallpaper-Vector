import { Component } from '@angular/core';
import { WallpaperComponent } from './wallpaper/wallpaper';

@Component({
  selector: 'app-root',
  imports: [WallpaperComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
