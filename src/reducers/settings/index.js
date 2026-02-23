import { combineReducers } from 'redux';

import showingConnections from './showingConnections';
import ammConfig from './ammConfig';

export default combineReducers({
  showingConnections,
  ammConfig,
});
