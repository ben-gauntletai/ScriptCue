import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainStackParamList } from './types';
import ScriptsOverview from '../screens/script/ScriptsOverview';
import ScriptDetail from '../screens/script/ScriptDetail';
import EditScript from '../screens/script/EditScript';
import NewScript from '../screens/script/NewScript';
import UploadScript from '../screens/script/UploadScript';
import CharacterSelection from '../screens/script/CharacterSelection';
import ScriptReader from '../screens/script/ScriptReader';

const Stack = createNativeStackNavigator<MainStackParamList>();

const MainNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Scripts" component={ScriptsOverview} />
      <Stack.Screen name="NewScript" component={NewScript} />
      <Stack.Screen name="UploadScript" component={UploadScript} />
      <Stack.Screen name="ScriptDetail" component={ScriptDetail} />
      <Stack.Screen name="EditScript" component={EditScript} />
      <Stack.Screen name="CharacterSelection" component={CharacterSelection} />
      <Stack.Screen name="ScriptReader" component={ScriptReader} />
    </Stack.Navigator>
  );
};

export default MainNavigator; 