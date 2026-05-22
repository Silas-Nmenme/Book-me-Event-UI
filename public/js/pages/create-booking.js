import { getRequest, createBooking, createPayment, apiFetch } from '../api.js';
import { toast } from '../ui.js';

function qs(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

export async function initCreateBookingPage() {
  const requestId = qs('requestId');
  const requestSummary = document.getElementById('requestSummary');
  const form = document.getElementById('createBookingForm');
  const btnCreate = document.getElementById('btnCreateBooking');
  const confirmation = document.getElementById('confirmation');
  const confirmationText = document.getElementById('confirmationText');
  const btnRecordPayment = document.getElementById('btnRecordPayment');

  if (!form) return;

  let loadedRequest = null;
  if (requestId) {
    try {
      const res = await getRequest(requestId);
      loadedRequest = res?.data || res;
      requestSummary.innerHTML = `<div class="card p-2"><strong>Request:</strong> ${loadedRequest._id || loadedRequest.id} • <small class="text-muted">${loadedRequest?.service?.name || loadedRequest?.service?.serviceName || ''}</small></div>`;
      const tot = loadedRequest.totalAmount || loadedRequest?.service?.price || '';
      const eventDateEl = document.getElementById('eventDate');
      const eventLocationEl = document.getElementById('eventLocation');
      const totalAmountEl = document.getElementById('totalAmount');
      if (loadedRequest.eventDate) eventDateEl.value = new Date(loadedRequest.eventDate).toISOString().slice(0,10);
      if (loadedRequest.eventLocation) eventLocationEl.value = loadedRequest.eventLocation;
      if (tot) totalAmountEl.value = tot;

      // If request has no linked service, try to load vendor services so user can pick one.
      if (!loadedRequest.service) {
        try {
          const svcRes = await apiFetch('/api/v1/services?limit=200', { method: 'GET' });
          const services = svcRes?.data || svcRes || [];
          const vendorId = loadedRequest?.vendor?._id || loadedRequest?.vendor || null;
          const vendorServices = Array.isArray(services)
            ? services.filter((s) => (s?.vendor?._id || s?.vendor?._id || s?.vendor) == vendorId)
            : [];

          if (vendorServices && vendorServices.length) {
            // insert a select into the form for service choice
            const totalAmountGroup = document.getElementById('totalAmount')?.closest('.col-12') || document.getElementById('totalAmount')?.parentElement;
            const wrapper = document.createElement('div');
            wrapper.className = 'col-12 col-md-6';
            wrapper.innerHTML = `
              <label class="form-label small">Service (select)</label>
              <select id="serviceSelectForBooking" class="form-select form-select-sm" required>
                <option value="">Select a service</option>
                ${vendorServices.map(s => `<option value="${s._id}">${(s.serviceName || s.serviceName) + (s.basePrice ? ' — ' + s.basePrice : '')}</option>`).join('')}
              </select>
            `;
            // insert before total amount group if found, otherwise append to form row
            const row = document.querySelector('#createBookingForm .row');
            if (totalAmountGroup && totalAmountGroup.parentElement) {
              totalAmountGroup.parentElement.insertBefore(wrapper, totalAmountGroup);
            } else if (row) {
              row.insertBefore(wrapper, row.firstChild);
            }
          }
        } catch (e) {
          // ignore vendor services load failure; user will see clear error on submit
        }
      }
    } catch (err) {
      toast({ title: 'Request not found', message: err?.message || '', variant: 'danger' });
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnCreate.setAttribute('disabled', 'disabled');
    const prevLabel = btnCreate.textContent;
    btnCreate.textContent = 'Creating…';
    try {
      // basic validation
      const evDate = document.getElementById('eventDate').value;
      const evLoc = document.getElementById('eventLocation').value?.trim();
      const tot = Number(document.getElementById('totalAmount').value) || 0;

      if (!loadedRequest) {
        throw new Error('Request not loaded — cannot create booking.');
      }
      if ((loadedRequest.status || '').toString().toUpperCase() !== 'ACCEPTED') {
        throw new Error('Request must be accepted before creating a booking.');
      }
      if (!evDate) throw new Error('Event date is required');
      if (!evLoc) throw new Error('Event location is required');
      if (!tot || tot <= 0) throw new Error('Enter a valid total amount');

      // Determine a reliable service id to include in the payload.
      // Backend requires either the request to have a linked service or the payload to provide one.
      let serviceId = null;
      if (loadedRequest?.service) {
        if (typeof loadedRequest.service === 'string') {
          serviceId = loadedRequest.service;
        } else {
          serviceId = loadedRequest.service._id || loadedRequest.service.id || loadedRequest.service.serviceId || loadedRequest.serviceId || null;
        }
      }
      // Additional fallbacks for common field names
      if (!serviceId) serviceId = loadedRequest?.serviceId || null;

      // If still missing, try the service selector rendered earlier (if any)
      if (!serviceId) {
        const sel = document.getElementById('serviceSelectForBooking');
        if (sel) serviceId = sel.value || null;
      }

      if (!serviceId) {
        throw new Error('Request must have a service linked, or service must be provided in payload');
      }

      const payload = {
        request: requestId,
        service: serviceId,
        eventDate: evDate,
        eventLocation: evLoc,
        totalAmount: tot,
        amountCurrency: loadedRequest?.budgetCurrency || 'NGN',
        specialRequests: document.getElementById('specialRequests').value || '',
      };

      const bookingRes = await createBooking(payload);
      const booking = bookingRes?.data || bookingRes;
      confirmationText.textContent = `Booking ${booking._id || booking.id} created successfully.`;
      confirmation.classList.remove('d-none');
      form.classList.add('d-none');

      // attach record payment handler
      btnRecordPayment.addEventListener('click', async () => {
        try {
          toast({ title: 'Processing', message: 'Recording payment...', variant: 'info' });
          await createPayment({ booking: booking._id || booking.id, paymentMethod: 'OFFLINE', transactionReference: 'OFFLINE-' + Date.now(), paymentGateway: 'MANUAL' });
          toast({ title: 'Payment', message: 'Payment recorded.', variant: 'success' });
          setTimeout(() => { window.location.href = 'bookings.html'; }, 600);
        } catch (err) {
          toast({ title: 'Payment failed', message: err?.message || 'Try again.', variant: 'danger' });
        }
      });

    } catch (err) {
      const msg = err?.data?.message || err?.message || 'Try again';
      toast({ title: 'Create booking failed', message: msg, variant: 'danger' });
    } finally {
      btnCreate.removeAttribute('disabled');
      btnCreate.textContent = prevLabel;
    }
  });
}
