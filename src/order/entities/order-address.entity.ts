import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Snapshot shipping address at checkout time.
 * Not linked to any live user-address entity.
 */
@Entity('order_addresses')
export class OrderAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  fullName: string;

  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'varchar' })
  city: string;

  @Column({ type: 'varchar' })
  addressLine1: string;

  @Column({ type: 'varchar', nullable: true })
  addressLine2: string | null;

  @Column({ type: 'varchar' })
  postalCode: string;
} //need to add in customer side addresses .. set as default... 
