import './src/core/crypto/installSecureRandom';
import React from 'react';
import { registerRootComponent } from 'expo';
import { AppProviders } from './src/app/providers/AppProviders';
import { RootNavigator } from './src/app/RootNavigator';

function App() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

registerRootComponent(App);
