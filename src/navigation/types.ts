import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

export type AppStackParamList = {
  Home: undefined;
  UploadScript: undefined;
  CharacterSelection: {
    scriptId: string;
  };
  ScriptReader: {
    scriptId: string;
    character: string;
  };
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppStackParamList>;
};

export type MainTabParamList = {
  Scripts: NavigatorScreenParams<RootStackParamList>;
  Profile: undefined;
  Settings: undefined;
}; 