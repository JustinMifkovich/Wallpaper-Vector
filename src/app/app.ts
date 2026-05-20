import { Component } from '@angular/core';
import { WallpaperComponent } from './wallpaper/wallpaper';
import { PodListComponent } from './pod-list/pod-list';

@Component({
  selector: 'app-root',
  imports: [WallpaperComponent, PodListComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
