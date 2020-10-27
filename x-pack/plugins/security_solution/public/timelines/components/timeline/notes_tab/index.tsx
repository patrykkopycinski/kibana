/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React from 'react';

const NotesTabContentComponent = () => {
  return (
    <EuiFlexGroup>
      <EuiFlexItem grow={2} style={{ width: '60%' }}>
        {/* <NotesButton
            animate={true}
            associateNote={associateNote}
            getNotesByIds={getNotesByIds}
            noteIds={noteIds}
            showNotes={showNotes}
            size="l"
            status={status}
            text={i18n.NOTES}
            toggleShowNotes={onToggleShowNotes}
            toolTip={i18n.NOTES_TOOL_TIP}
            updateNote={updateNote}
            timelineType={timelineType}
          /> */}
      </EuiFlexItem>
      <EuiFlexItem grow={1}>{'Sidebar'}</EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const NotesTabContent = React.memo(NotesTabContentComponent);
