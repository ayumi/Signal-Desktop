// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { MessageAttributesType } from '../model-types.d';
import type { MessageModel } from '../models/messages';
import type { SignalService as Proto } from '../protobuf';
import * as log from '../logging/log';
import { filter } from './iterables';
import { getContactId } from '../messages/helpers';
import { getTimestampFromLong } from './timestampLongUtils';

export async function findStoryMessages(
  conversationId: string,
  storyContext?: Proto.DataMessage.IStoryContext
): Promise<Array<MessageModel>> {
  if (!storyContext) {
    return [];
  }

  const { authorUuid, sentTimestamp } = storyContext;

  if (!authorUuid || !sentTimestamp) {
    return [];
  }

  const sentAt = getTimestampFromLong(sentTimestamp);
  const ourConversationId =
    window.ConversationController.getOurConversationIdOrThrow();

  const inMemoryMessages = window.MessageController.filterBySentAt(sentAt);
  const matchingMessages = [
    ...filter(inMemoryMessages, item =>
      isStoryAMatch(
        item.attributes,
        conversationId,
        ourConversationId,
        authorUuid,
        sentAt
      )
    ),
  ];

  if (matchingMessages.length > 0) {
    return matchingMessages;
  }

  log.info('findStoryMessages: db lookup needed', sentAt);
  const messages = await window.Signal.Data.getMessagesBySentAt(sentAt);
  const found = messages.filter(item =>
    isStoryAMatch(item, conversationId, ourConversationId, authorUuid, sentAt)
  );

  if (found.length === 0) {
    log.info('findStoryMessages: message not found', sentAt);
    return [];
  }

  const result = found.map(attributes =>
    window.MessageController.register(attributes.id, attributes)
  );
  return result;
}

function isStoryAMatch(
  message: MessageAttributesType | null | undefined,
  conversationId: string,
  ourConversationId: string,
  authorUuid: string,
  sentTimestamp: number
): message is MessageAttributesType {
  if (!message) {
    return false;
  }

  const authorConversation = window.ConversationController.lookupOrCreate({
    e164: undefined,
    uuid: authorUuid,
    reason: 'isStoryAMatch',
  });

  return (
    message.sent_at === sentTimestamp &&
    getContactId(message) === authorConversation?.id &&
    (message.conversationId === conversationId ||
      message.conversationId === ourConversationId)
  );
}
