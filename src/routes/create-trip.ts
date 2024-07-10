import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import { getMailClient } from '../lib/mail'
import nodemailer from 'nodemailer'
import localizedFormat from 'dayjs/plugin/localizedFormat'

dayjs.locale('pt-br')
dayjs.extend(localizedFormat)

export async function createTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/trips',
    {
      schema: {
        body: z.object({
          destination: z.string().min(4),
          starts_at: z.coerce.date(),
          ends_at: z.coerce.date(),
          owner_name: z.string(),
          owner_email: z.string().email(),
          emails_to_invite: z.array(z.string().email())
        })
      }
    },
    async request => {
      const { destination, ends_at, starts_at, owner_email, owner_name, emails_to_invite } =
        request.body

      if (dayjs(starts_at).isBefore(new Date())) {
        throw new Error('Invalid trip start date')
      }

      if (dayjs(ends_at).isBefore(starts_at)) {
        throw new Error('Invalid trip end date')
      }

      const trip = await prisma.trip.create({
        data: {
          destination,
          starts_at,
          ends_at,
          participants: {
            createMany: {
              data: [
                {
                  name: owner_name,
                  email: owner_email,
                  is_owner: true,
                  is_confirmed: true
                },
                ...emails_to_invite.map(email => ({
                  email
                }))
              ]
            }
          }
        }
      })

      const mail = await getMailClient()

      const formattedStartDate = dayjs(starts_at).format('LL')
      const formattedEndDate = dayjs(ends_at).format('LL')

      const confirmationLink = `http://localhost:3333/trips/${trip.id}/confirm`

      const message = await mail.sendMail({
        from: {
          name: 'Equipe Plann.er',
          address: 'Hello@plann.er'
        },
        to: {
          name: owner_name,
          address: owner_email
        },
        subject: `Confirme sua viagem para ${destination}`,
        html: `
        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;">
          <p>Você solicitou a criação de uma viagem para <strong>${destination}</strong> nas datas de <strong>${formattedStartDate}</strong> até <strong>${formattedEndDate}</strong>.</p>
          <p></p>
          <p>Para confirmar sua viagem, clique no link abaixo:</p>
          <p></p>
          <p>
            <a href="${confirmationLink}">Confirmar viagem</a>
          </p>
          <p></p>
          <p>Caso você não saiba do que se trata esse e-mail, apenas ignore esse e-mail.</p>
        </div>
      `.trim()
      })

      console.log(nodemailer.getTestMessageUrl(message))

      return trip
    }
  )
}