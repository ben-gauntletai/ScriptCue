import { NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type MainStackParamList = {
  Scripts: {
    newScriptId?: string;
    scriptTitle?: string;
  } | undefined;
  NewScript: undefined;
  UploadScript: undefined;
  ScriptDetail: { 
    scriptId: string;
  };
  ScriptReader: { 
    scriptId: string; 
    character: string;
  };
  EditScript: { 
    scriptId: string;
  };
  PracticeScript: { 
    scriptId: string;
    characterId: string;
    startLine?: number;
  };
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
};

export type AuthNavigationProp = NativeStackNavigationProp<AuthStackParamList>;
export type MainNavigationProp = NativeStackNavigationProp<MainStackParamList>;
export type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export type MainTabParamList = {
  Scripts: NavigatorScreenParams<MainStackParamList>;
  Profile: undefined;
  Settings: undefined;
}; 