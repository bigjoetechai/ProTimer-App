/**
 * Secondary Display Route for Presenter, Stage, Preview, Fullscreen, Multi FS, NDI, and LAN views.
 */

import React from 'react';
import { 
  PresenterDisplay, 
  StageDisplay, 
  PreviewDisplay, 
  FullscreenDisplay,
  MultiFullscreenDisplay,
  LanControlDisplay,
  NdiDisplay,
} from '../displays';
import { DisplayTarget } from '../types';

interface DisplayPageProps {
  target: DisplayTarget;
}

export const DisplayPage: React.FC<DisplayPageProps> = ({ target }) => {
  switch (target) {
    case 'presenter':
      return <PresenterDisplay />;
    case 'stage':
    case 'lan_display':
      return <StageDisplay />;
    case 'fullscreen':
      return <FullscreenDisplay />;
    case 'multi_fullscreen':
      return <MultiFullscreenDisplay />;
    case 'lan_control':
      return <LanControlDisplay />;
    case 'ndi':
      return <NdiDisplay />;
    case 'preview':
    default:
      return <PreviewDisplay />;
  }
};
