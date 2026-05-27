import { Component } from '@angular/core';
import { WallpaperComponent } from './wallpaper/wallpaper';
import { DustComponent } from './dust/dust';
import { PodListComponent } from './pod-list/pod-list';

@Component({
  selector: 'app-root',
  imports: [WallpaperComponent, DustComponent, PodListComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
