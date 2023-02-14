/**
 * @author Pedro Fuentes <git@pedrofuent.es>
 * @copyright 2021 Pedro Pablo Fuentes Schuster
 * @license MIT
 */
/* global fetch */
import ical from './ical.js'
import { isValidURL, sleep } from './utils.js'
import { deepEqual } from 'fast-equals'

window.eventsCache = {
  version: 0,
  status: null,
  events: []
}
let totalHoursSpread = 36

function isAllDayEvent (object) {
  return object['MICROSOFT-CDO-ALLDAYEVENT'] === 'TRUE'
}

function isTimeWithinHours (date, hours) {
  const today = new Date()
  const now = today.getTime()
  const spread = (hours * 60 * 60 * 1000) / 2
  const event = date.getTime()
  const bottomRange = now - spread
  const topRange = now + spread

  return (event >= bottomRange) && (event <= topRange)
}

function isNotAllDayEvent (object) {
  return !isAllDayEvent(object)
}

function isEventWithinHours (event) {
  return isTimeWithinHours(event.start, totalHoursSpread)
}

function compareEventsStartDates (firstEl, secondEl) {
  return firstEl.start.getTime() - secondEl.start.getTime()
}

function filterEvents (events, ...args) {
  let selectedEvents = []

  for (const key in events) {
    if (Object.prototype.hasOwnProperty.call(events, key)) {
      const event = events[key]
      if (event.type === 'VEVENT') {
        let valid = true
        if (Object.prototype.hasOwnProperty.call(event, 'recurrences')) {
          selectedEvents = selectedEvents.concat(filterEvents(event.recurrences, args))
        } else {
          if (args[0][0]) args = args[0]
          args.forEach((check) => {
            if (!check(event)) valid = false
          })

          if (valid) {
            selectedEvents.push({
              uid: event.uid,
              summary: event.summary,
              start: event.start,
              end: event.end,
              busyStatus: event.microsoftBusyStatus
            })
          }
        }
      }
    }
  }

  return selectedEvents
}

export function setHoursSpread (newSpread) {
  totalHoursSpread = newSpread
}

export async function updateEventsCache (data, version) {
  // if versions differ it means that a new load has been triggered with a new url so we don't store this data
  if (version === window.loadedUrlVersion) {
    const events = ical.parseICS(data)
    const filteredAndSortedEvents = filterEvents(events, isNotAllDayEvent, isEventWithinHours).sort(compareEventsStartDates)
    // TODO: if no change maybe no need to update and return even?
    if (!deepEqual(window.eventsCache.events, filteredAndSortedEvents)) window.eventsCache.version++
    window.eventsCache.events = filteredAndSortedEvents
    return filteredAndSortedEvents
  }
}

export default async function fetchIcalAndUpdateCache (streamDeck, updateFrequency, version, callback = null) {
  const url = streamDeck.globalSettings.url
  if (isValidURL(url)) {
    // if versions differ it means that a new load has been triggered with a new url
    if (version === window.loadedUrlVersion) {
      window.eventsCache.status = 'loading'
      return fetch(url)
        .then((response) => response.text())
        .then((data) => updateEventsCache(data, version))
        .then(() => {
          window.eventsCache.status = 'loaded'
          if (typeof callback === 'function') callback()
          setTimeout(fetchIcalAndUpdateCache, 1000 * 60 * updateFrequency, streamDeck, updateFrequency, version, callback)
        })
        .catch((error) => {
          window.eventsCache.status = 'error'
          console.error('There has been a problem with your fetch operation:', error)
        })
    }
  } else {
    window.eventsCache.status = 'invalid'
    await sleep(1000)
    await fetchIcalAndUpdateCache(streamDeck, updateFrequency, version, callback)
  }
}
