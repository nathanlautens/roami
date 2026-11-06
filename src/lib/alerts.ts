import { Alert } from 'react-native';

import { friendlyError } from './roams';

/** Shows a database error in Roami's voice. */
export function alertError(e: unknown, toText: (e: unknown) => string = friendlyError, title = 'Hmm') {
  Alert.alert(title, toText(e));
}
