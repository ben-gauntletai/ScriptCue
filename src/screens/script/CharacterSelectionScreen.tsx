import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScriptCharacter } from '../../types/script';
import { RootStackParamList } from '../../navigation/types';

type CharacterSelectionScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'CharacterSelection'
>;

type CharacterSelectionScreenRouteProp = RouteProp<
  RootStackParamList,
  'CharacterSelection'
>;

interface ScriptData {
  characters: {
    [key: string]: {
      name: string;
      voiceId: string | null;
      gender: 'male' | 'female' | 'unknown';
    };
  };
}

export const CharacterSelectionScreen: React.FC = () => {
  const [characters, setCharacters] = useState<ScriptCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<CharacterSelectionScreenNavigationProp>();
  const route = useRoute<CharacterSelectionScreenRouteProp>();
  const { scriptId } = route.params;

  useEffect(() => {
    const loadCharacters = async () => {
      try {
        const scriptDoc = await firestore().collection('scripts').doc(scriptId).get();
        
        if (!scriptDoc.exists) {
          Alert.alert('Error', 'Script not found');
          navigation.goBack();
          return;
        }

        const scriptData = scriptDoc.data() as ScriptData;
        const characterData = scriptData?.characters || {};
        
        const characterList = Object.entries(characterData).map(([id, char]) => ({
          id,
          name: char.name,
          voiceId: char.voiceId,
          gender: char.gender,
        }));

        setCharacters(characterList);
      } catch (error) {
        console.error('Error loading characters:', error);
        Alert.alert('Error', 'Failed to load characters');
      } finally {
        setLoading(false);
      }
    };

    loadCharacters();
  }, [scriptId, navigation]);

  const handleCharacterSelect = (character: ScriptCharacter) => {
    navigation.navigate('ScriptReader', {
      scriptId,
      character: character.id,
    });
  };

  const renderCharacterItem = ({ item }: { item: ScriptCharacter }) => (
    <TouchableOpacity
      style={styles.characterItem}
      onPress={() => handleCharacterSelect(item)}
    >
      <View style={styles.characterInfo}>
        <Text style={styles.characterName}>{item.name}</Text>
        <Text style={styles.characterGender}>
          {item.gender.charAt(0).toUpperCase() + item.gender.slice(1)}
        </Text>
      </View>
      <Icon name="chevron-right" size={24} color="#666" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Select Character</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={characters}
        renderItem={renderCharacterItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No characters found</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  characterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  characterGender: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E5EA',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
}); 